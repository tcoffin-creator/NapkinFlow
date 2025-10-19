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

  const systemPrompt = `You are a JSON-only generator. Given a plain-text workflow prompt, produce only valid JSON with a single top-level "graph" object:
{
  "graph": {
    "nodes": [ { "id":"n1", "label":"Start", "type":"start" }, ... ],
    "edges": [ { "from":"n1", "to":"n2", "label":"yes" }, ... ]
  }
}
Do not include any extra text, comments, or markdown. If you cannot produce a graph, return { "graph": { "nodes": [], "edges": [] } }.`.trim();

  try {
    const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1200,
        temperature: 0.2,
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

    // Extract JSON substring from assistantText if any
    const jsonMatch = assistantText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const assistantJson = JSON.parse(jsonMatch[0]);

        // If assistantJson.graph exists, coerce it to an object if it is a string
        if (assistantJson?.graph !== undefined) {
          let graphObj = assistantJson.graph;

          // If graph is a string containing JSON, parse it
          if (typeof graphObj === 'string') {
            try {
              graphObj = JSON.parse(graphObj);
            } catch (e) {
              // parsing failed; return helpful error with raw text
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
      } catch (e) {
        // JSON substring parse failed — fall through to return raw for debugging
      }
    }

    // If we get here, no JSON graph found — return raw assistant text for debugging
    return new Response(JSON.stringify({
      error: 'Could not extract JSON graph from assistant output',
      rawAssistantText: assistantText.slice(0, 2000)
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error', message: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
    });
  }
}
