export async function onRequest(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin') || '*';

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // Only allow POST here
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
    });
  }

  // Read JSON body
  let body;
  try {
    body = await request.json();
  } catch (err) {
    const text = await request.text();
    return new Response(JSON.stringify({ error: 'Invalid JSON body', bodyText: text }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
    });
  }

  const prompt = (body && body.prompt) ? String(body.prompt) : '';
  if (!prompt || prompt.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'Missing prompt in request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
    });
  }

  // Read OpenAI key from env (Cloudflare Pages Functions expose secrets via context.env)
  const OPENAI_API_KEY = env?.OPENAI_API_KEY || process?.env?.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: OPENAI_API_KEY missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
    });
  }

  // System prompt: instruct JSON-only output and include workflow syntax used by the UI
  const systemPrompt = `You are an expert flowchart designer with strong logical reasoning skills. Your job is to take ANY user input—whether it's a single word like "pizza", a vague idea, or a detailed workflow—and produce a clear, logical, well-structured flowchart in JSON format.

Always return ONLY valid JSON with a single top-level "graph" object:
{
  "graph": {
    "nodes": [ { "id":"n1", "label":"Start", "type":"process" }, { "id":"n2", "label":"Check status?", "type":"decision" }, ... ],
    "edges": [ { "from":"n1", "to":"n2", "label":"yes" }, ... ]
  }
}

Do not include any extra text, comments, or markdown. If you cannot produce a graph, return { "graph": { "nodes": [], "edges": [] } }.

CRITICAL FLOWCHART DESIGN RULES:
1. **Clear branching logic**: Decision nodes (ending with '?') must have 2+ outgoing edges with clear labels (yes/no, true/false, option names).
2. **Proper convergence**: When branches rejoin, they must point to the SAME node ID and label. Don't create duplicate "End" nodes.
3. **Logical flow**: Think through the actual process step-by-step. Each node should represent a meaningful action or decision.
4. **Node types**: Use "decision" type ONLY for nodes ending with '?'. All others are "process" type.
5. **Unique IDs**: Each node must have a unique id (n1, n2, n3...). Never reuse IDs.
6. **Edge labels**: Label decision branches clearly (yes/no, approved/rejected, option A/B/C).

Be creative but logical: If the user says "pizza", create a flowchart about ordering/making pizza with decision points. If they say "startup", create a flowchart about launching a startup with key milestones and decisions. Always generate a flowchart no matter what the input is.

GOOD EXAMPLE (proper branching and convergence):
Input: "morning routine"
{
  "graph": {
    "nodes": [
      { "id": "n1", "label": "Wake up", "type": "process" },
      { "id": "n2", "label": "Hit snooze?", "type": "decision" },
      { "id": "n3", "label": "Sleep 10 min", "type": "process" },
      { "id": "n4", "label": "Shower", "type": "process" },
      { "id": "n5", "label": "Breakfast", "type": "process" },
      { "id": "n6", "label": "Leave home", "type": "process" }
    ],
    "edges": [
      { "from": "n1", "to": "n2" },
      { "from": "n2", "to": "n3", "label": "yes" },
      { "from": "n3", "to": "n1" },
      { "from": "n2", "to": "n4", "label": "no" },
      { "from": "n4", "to": "n5" },
      { "from": "n5", "to": "n6" }
    ]
  }
}

When you output the JSON graph ensure:
- Each node has an 'id' (string, e.g. "n1", "n2"), 'label' (string, the text shown), and 'type' (either 'process' or 'decision').
- Decision nodes must have labels ending with '?'
- Each edge has 'from' and 'to' set to node ids and an optional 'label' for the edge text.
- When branches converge, use the SAME node id (don't duplicate nodes).
- Aim for 6-12 nodes for good visual flow.
`.trim();

  try {
    const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1500,
        temperature: 0.3,
      }),
    });

    const raw = await openaiResp.text();

    if (!openaiResp.ok) {
      return new Response(JSON.stringify({ error: 'OpenAI API error', status: openaiResp.status, raw: raw.slice(0, 2000) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
      });
    }

    // Try to parse wrapper response
    let parsedTop = null;
    try { parsedTop = JSON.parse(raw); } catch (e) { parsedTop = null; }

    // Extract assistant text if present
    let assistantText = '';
    if (parsedTop?.choices && parsedTop.choices[0]?.message?.content) {
      assistantText = parsedTop.choices[0].message.content;
    } else {
      assistantText = raw;
    }

    // --- Improved JSON extraction/parsing ---
    // 1) Remove outer markdown/code fences (``` or ```json)
    // 2) Try parsing the inner fenced content first
    // 3) Fall back to extracting first {...} block
    // 4) If graph is a string, try parsing that string

    // Normalize: strip common wrapper fences
    let sanitized = assistantText.replace(/\r\n/g, '\n').trim();

    // If assistant wrapped JSON in code fences, capture the inner content(s)
    const fenceMatch = sanitized.match(/```(?:json)?\n([\s\S]*?)\n```/i);
    if (fenceMatch && fenceMatch[1]) {
      sanitized = fenceMatch[1].trim();
    } else {
      // Also remove single-line backticks or surrounding triple backticks without language
      sanitized = sanitized.replace(/^```+|```+$/g, '').trim();
    }

    // Attempt 1: parse whole sanitized string
    let assistantJson = null;
    try {
      assistantJson = JSON.parse(sanitized);
    } catch (e) {
      assistantJson = null;
    }

    // Attempt 2: if parsing whole string failed, try to find a JSON object substring {...}
    if (!assistantJson) {
      const jsonMatch = sanitized.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          assistantJson = JSON.parse(jsonMatch[0]);
        } catch (e) {
          // parsing failed — include raw snippets in error below
        }
      }
    }

    // If we still don't have JSON, return raw assistant text for debugging
    if (!assistantJson) {
      return new Response(JSON.stringify({
        error: 'Could not extract JSON graph from assistant output',
        // return both sanitized and original assistant text (truncated) to aid debugging
        sanitizedAssistantText: sanitized.slice(0, 2000),
        rawAssistantText: assistantText.slice(0, 2000),
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
      });
    }

    // If assistantJson.graph exists, coerce it to an object if it is a string
    if (assistantJson?.graph !== undefined) {
      let graphObj = assistantJson.graph;

      // If graph is a string containing JSON, parse it
      if (typeof graphObj === 'string') {
        try {
          graphObj = JSON.parse(graphObj);
        } catch (e) {
          return new Response(JSON.stringify({
            error: 'Assistant returned graph as a string but it could not be parsed',
            rawAssistantText: assistantText.slice(0, 2000),
            rawGraphString: assistantJson.graph.slice(0, 2000)
          }), {
            status: 502,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
          });
        }
      }

      // Validate result shape minimally
      if (graphObj && typeof graphObj === 'object' && Array.isArray(graphObj.nodes) && Array.isArray(graphObj.edges)) {
        return new Response(JSON.stringify({ graph: graphObj }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
        });
      } else {
        return new Response(JSON.stringify({
          error: 'Parsed graph did not have expected shape',
          parsedGraph: graphObj,
          rawAssistantText: assistantText.slice(0, 2000)
        }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
        });
      }
    } else {
      return new Response(JSON.stringify({
        error: 'Assistant JSON missing "graph" key',
        rawAssistantJson: assistantJson,
        rawAssistantText: assistantText.slice(0, 2000)
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error', message: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
    });
  }
}
