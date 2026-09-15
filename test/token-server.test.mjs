import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { createTokenHandler } from '../token-server.mjs';

async function withServer(t, options = {}) {
  let handler;
  const server = createServer((req, res) => handler(req, res));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  handler = createTokenHandler({ apiKey: 'server-secret', origin, ...options });
  return {
    origin,
    request: (overrides = {}) => fetch(`${origin}/api/dns-widget-token`, {
      method: 'POST', headers: { origin }, ...overrides
    })
  };
}

test('only the server sends the API key; browser receives a non-cacheable token', async (t) => {
  let sent;
  const h = await withServer(t, { fetchImpl: async (url, options) => {
    sent = { url, options };
    return Response.json({ token: 'short-lived-token', internal: 'do not forward' });
  } });
  const reply = await h.request();
  assert.equal(reply.status, 200);
  assert.equal(reply.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await reply.json(), { token: 'short-lived-token' });
  assert.equal(sent.url, 'https://cloud.approximated.app/api/dns/v2/token');
  assert.equal(sent.options.headers['api-key'], 'server-secret');
  assert.equal(sent.options.redirect, 'error');
});

test('refuses cross-origin, missing-origin, and forged-host requests before token minting', async (t) => {
  let calls = 0;
  const h = await withServer(t, { fetchImpl: async () => { calls++; return Response.json({ token: 'x' }); } });
  for (const headers of [{ origin: 'https://untrusted.example' }, {}]) {
    assert.equal((await h.request({ headers })).status, 403);
  }
  const forgedHostStatus = await new Promise((resolve, reject) => {
    const req = httpRequest(`${h.origin}/api/dns-widget-token`, { method: 'POST', headers: { origin: h.origin, host: 'untrusted.example' } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end();
  });
  assert.equal(forgedHostStatus, 403);
  assert.equal(calls, 0);
});

test('only POST is accepted and requests cannot override the upstream origin or credentials', async (t) => {
  let calls = 0;
  const h = await withServer(t, { fetchImpl: async () => { calls++; return Response.json({ token: 'x' }); } });
  const get = await h.request({ method: 'GET' });
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');
  assert.equal(calls, 0);
});

test('missing configuration fails closed without calling Approximated', async (t) => {
  const h = await withServer(t, { apiKey: '', fetchImpl: async () => { throw new Error('must not call'); } });
  assert.equal((await h.request()).status, 503);
});

test('upstream errors and malformed tokens cannot disclose upstream bodies or the API key', async (t) => {
  let reply;
  const h = await withServer(t, { fetchImpl: async () => reply });
  for (reply of [new Response('server-secret', { status: 401 }), Response.json({ token: '' }), new Response('not json')]) {
    const res = await h.request();
    assert.equal(res.status, 502);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal((await res.text()).includes('server-secret'), false);
  }
});

test('network failures become retryable gateway errors', async (t) => {
  const h = await withServer(t, { fetchImpl: async () => { throw new Error('private internal detail'); } });
  const reply = await h.request();
  assert.equal(reply.status, 502);
  assert.equal((await reply.text()).includes('private internal detail'), false);
});

test('the demo token handler cannot be configured for a public origin', () => {
  assert.throws(() => createTokenHandler({ apiKey: 'x', origin: 'https://example.com' }), /loopback/);
});
