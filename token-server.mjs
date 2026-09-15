// This endpoint is deliberately for a loopback-only demo. See README before production use.
export function createTokenHandler({ apiKey, origin, fetchImpl = globalThis.fetch }) {
  const local = new URL(origin);
  if (local.protocol !== 'http:' || local.hostname !== '127.0.0.1' || local.origin !== origin) {
    throw new Error('The demo token endpoint requires a loopback origin: http://127.0.0.1:PORT');
  }
  return async function tokenHandler(req, res) {
    const send = (status, body, extraHeaders = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST') return send(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
    if (req.headers.host !== local.host || req.headers.origin !== origin) {
      return send(403, { error: 'local_same_origin_required' });
    }
    if (!apiKey?.trim()) return send(503, { error: 'Set APX_API_KEY in your server .env file.' });
    try {
      const upstream = await fetchImpl('https://cloud.approximated.app/api/dns/v2/token', {
        method: 'GET',
        headers: { 'api-key': apiKey, Accept: 'application/json' },
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000)
      });
      if (!upstream.ok) throw new Error('token_request_failed');
      const { token } = await upstream.json();
      if (typeof token !== 'string' || !token) throw new Error('invalid_token');
      send(200, { token });
    } catch {
      // Do not forward upstream bodies, which may contain internal details.
      send(502, { error: 'Could not obtain a widget token. Check your API key and try again.' });
    }
  };
}
