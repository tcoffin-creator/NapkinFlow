// Simple client helper to call the Pages Function at /api/generate
export async function generateFlowchartViaProxy(prompt, options = {}) {
  const proxyPath = options.proxyPath || '/api/generate';
  const resp = await fetch(proxyPath, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt }),
  });

  const txt = await resp.text();
  let data;
  try {
    data = JSON.parse(txt);
  } catch (e) {
    throw new Error('Invalid JSON from proxy: ' + txt.slice(0, 500));
  }

  if (!resp.ok) {
    const err = data?.error || 'Proxy request failed';
    throw new Error(err + (data?.details ? ' — ' + data.details : ''));
  }

  if (!data?.graph) throw new Error('Proxy did not return graph');
  return data.graph;
}