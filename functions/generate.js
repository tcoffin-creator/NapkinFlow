export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  // Optional origin restriction (set ALLOWED_ORIGIN in Pages environment variables)
  const origin = request.headers.get('Origin') || '';
  if (env.ALLOWED_ORIGIN && origin && !origin.includes(env.ALLOWED_ORIGIN)) {
    return new Response(JSON.stringify({ error: 'Forbidden: origin not allowed' }), { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const prompt = (body && body.prompt) ? String(body.prompt).trim() : '';
  if (!prompt) {
    return new Response(JSON.stringify({ error: 'Missing prompt' }), { status: 400 });
  }

  const system = `You are a helpful assistant that converts natural-language requests into a minimal flowchart representation. Output MUST be a pure JSON object with exactly two keys: nodes and edges. Nodes are objects with keys: id (unique short alphanumeric), label (string), type (one of "start","process","decision","end"). Edges are objects with keys: from (node id), to (node id), and optional label (string). Do NOT output any explanation or text outside the JSON object. If you cannot, return an empty nodes/edges structure. Keep nodes between 4 and 12 for typical prompts.`;

  const user = `Create a concise flowchart for: "${prompt}". Return only valid JSON following the schema above. If a decision exists, label edges like "yes" and "no".`;

  const OPENAI_KEY = env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: OPENAI_API_KEY missing' }), { status: 500 });
  }

  try {
    const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
        max_tokens: 800,
        n: 1,
      }),
    });

    if (!openaiResp.ok) {
      const txt = await openaiResp.text();
      return new Response(JSON.stringify({ error: 'LLM request failed', details: txt }), { status: 502 });
    }

    const data = await openaiResp.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      return new Response(JSON.stringify({ error: 'No content from LLM' }), { status: 502 });
    }

    // Strip code fences and surrounding text, try to parse JSON
    const cleaned = text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      // Try to extract a JSON object substring
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch (err2) {
          return new Response(JSON.stringify({ error: 'Failed to parse JSON from LLM response', raw: cleaned.slice(0, 1000) }), { status: 502 });
        }
      } else {
        return new Response(JSON.stringify({ error: 'No JSON found in LLM response', raw: cleaned.slice(0, 1000) }), { status: 502 });
      }
    }

    // Basic validation
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return new Response(JSON.stringify({ error: 'Invalid graph format from LLM', parsed: parsed }), { status: 502 });
    }

    // Return parsed graph
    return new Response(JSON.stringify({ graph: parsed }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin || '*',
      },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error', details: err.message }), { status: 500 });
  }
}
