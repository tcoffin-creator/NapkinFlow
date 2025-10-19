export async function onRequest(context) {
  const { request } = context;
  const origin = request.headers.get('Origin') || '*';

  // Handle CORS preflight
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

  // Read body safely
  let bodyText = '';
  try {
    bodyText = await request.text();
  } catch (e) {
    bodyText = '';
  }

  // Collect headers into an object
  const headersObj = {};
  try {
    for (const [k, v] of request.headers.entries()) headersObj[k] = v;
  } catch (e) {}

  const responsePayload = {
    debug: true,
    received: {
      method: request.method,
      headers: headersObj,
      bodyText: bodyText,
    },
    note: 'Temporary debug function at functions/api/generate.js to diagnose 405; remove after debugging.'
  };

  return new Response(JSON.stringify(responsePayload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}