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
    // fallback to text
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

  // Construct LLM prompt: instruct it to only return JSON { "graph": { "nodes": [...], "edges": [...] } }
  const systemPrompt = `You are a JSON-only generator. Given a plain-text workflow prompt, produce only valid JSON with a single top-level "graph" object:
{
  "graph": {
    "nodes": [ { "id":"n1", "label":"Start", "type":"start" }, ... ],
    "edges": [ { "from":"n1", "to":"n2", "label":"yes" }, ... ]
  }
}
Do not include any extra text, comments, or markdown. If you cannot produce a graph, return { "graph": { "nodes": [], "edges": [] } }.`.trim();

  try {
    // Call the OpenAI Chat Completions API
    const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // adjust model if needed
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1200,
        temperature: 0.2,
      }),
    });

    const contentType = openaiResp.headers.get('content-type') || '';
    const raw = await openaiResp.text();

    if (!openaiResp.ok) {
      // surface provider error with raw snippet
      return new Response(JSON.stringify({
        error: 'OpenAI API error',
        status: openaiResp.status,
        raw: raw.slice(0, 2000)
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
      });
    }

    // Try to extract JSON
    let parsed;
    try {
      // If OpenAI returns JSON directly (common), parse it
      parsed = JSON.parse(raw);
      // If content contains choices -> get assistant content
      if (parsed?.choices && parsed.choices[0]?.message?.content) {
        const assistantText = parsed.choices[0].message.content;
        // Try to parse assistantText as JSON
        try {
          const assistantJson = JSON.parse(assistantText);
          if (assistantJson?.graph) {
            return new Response(JSON.stringify({ graph: assistantJson.graph }), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': origin,
              },
            });
          } else {
            // assistant returned something parseable but no graph
            return new Response(JSON.stringify({
              error: 'OpenAI returned JSON but no "graph" key',
              rawAssistant: assistantText.slice(0, 2000)
            }), {
              status: 502,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
            });
          }
        } catch (e) {
          // assistantText wasn't JSON — attempt to extract JSON substring
          const m = assistantText.match(/\{[\s\S]*\}/);
          if (m) {
            try {
              const assistantJson2 = JSON.parse(m[0]);
              if (assistantJson2?.graph) {
                return new Response(JSON.stringify({ graph: assistantJson2.graph }), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
                });
              }
            } catch (_) {}
          }
          // fallback: return raw assistantText for debugging
          return new Response(JSON.stringify({
            error: 'Could not parse assistant output as JSON',
            rawAssistant: assistantText.slice(0, 2000),
          }), {
            status: 502,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
          });
        }
      }

      // If we've reached here but no choices.message.content, return raw parsed object
      return new Response(JSON.stringify({
        error: 'Unexpected OpenAI response format',
        raw: parsed
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
      });

    } catch (e) {
      // raw is not top-level JSON — maybe the service returned text directly
      // try to extract JSON substring from raw
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          const assistantJson = JSON.parse(m[0]);
          if (assistantJson?.graph) {
            return new Response(JSON.stringify({ graph: assistantJson.graph }), {
              status: 200,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
            });
          } else {
            return new Response(JSON.stringify({
              error: 'Parsed JSON from raw but no graph key',
              rawSnippet: m[0].slice(0, 2000)
            }), {
              status: 502,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
            });
          }
        } catch (err2) {
          // give up and return raw for debugging
          return new Response(JSON.stringify({
            error: 'Failed to parse OpenAI response',
            raw: raw.slice(0, 2000)
          }), {
            status: 502,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
          });
        }
      } else {
        return new Response(JSON.stringify({
          error: 'OpenAI returned non-JSON response',
          raw: raw.slice(0, 2000)
        }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
        });
      }
    }
  } catch (err) {
    // Unexpected runtime error
    return new Response(JSON.stringify({ error: 'Server error', message: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
    });
  }
}
