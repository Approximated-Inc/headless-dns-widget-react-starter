import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDnsSetup } from '../shared/session.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
const result = (domain) => ({ domains: [{ records: [{ domain, host: '@', type: 'CNAME', match_against: 'domains.example.com' }] }] });
function harness(options = {}) {
  let state;
  const clients = [];
  const session = createDnsSetup({
    onChange: (next) => { state = next; },
    fetchImpl: options.fetchImpl || (async () => response({ token: 'widget-token' })),
    createClient: (config) => {
      const client = { config, stopped: false, stop() { this.stopped = true; },
        instructions: options.instructions || (async ({ domain }) => result(domain)),
        verify: options.verify || (async () => ({ records: [{ match: true }] })),
        summarize: (records) => records.every((r) => r.match === true) ? 'complete' : records.some((r) => r.match === true) ? 'partial' : 'failed'
      };
      clients.push(client);
      return client;
    }
  });
  return { session, clients, state: () => state };
}

test('passes the supplied domain with host @, then verifies the original result', async () => {
  let request, verified;
  const h = harness({ instructions: async (r) => { request = r; return result(r.domain); }, verify: async (r) => { verified = r; return { records: [{ match: true }] }; } });
  await h.session.start('shop.customer.com', 'domains.example.com');
  assert.deepEqual(request, { domain: 'shop.customer.com', records: [{ type: 'CNAME', host: '@', value: 'domains.example.com', ttl: 3600 }] });
  const original = h.state().result;
  await h.session.verify();
  assert.equal(verified, original);
  assert.equal(h.state().phase, 'complete');
  assert.equal(h.clients[0].stopped, true);
});

test('session uses the v2 browser API URL with its scoped token', async () => {
  const h = harness();
  await h.session.start('shop.customer.com', 'domains.example.com');
  assert.equal(h.clients[0].config.token, 'widget-token');
  assert.equal(h.clients[0].config.api_url, 'https://cloud.approximated.app/api/dns/v2');
  h.session.dispose();
});

test('changing domains discards an older verification and stops its client', async () => {
  const pending = deferred();
  const h = harness({ verify: () => pending.promise });
  await h.session.start('old.customer.com', 'domains.example.com');
  const checking = h.session.verify();
  h.session.reset();
  await h.session.start('shop.customer.com', 'domains.example.com');
  pending.resolve({ records: [{ match: true }] });
  await checking;
  assert.equal(h.state().phase, 'ready');
  assert.equal(h.state().check, null);
  assert.equal(h.state().result.domains[0].records[0].domain, 'shop.customer.com');
  assert.equal(h.clients[0].stopped, true);
  h.session.dispose();
});

test('unmount during token acquisition never creates a client or publishes late state', async () => {
  const pending = deferred();
  const h = harness({ fetchImpl: () => pending.promise });
  const starting = h.session.start('shop.customer.com', 'domains.example.com');
  const before = h.state();
  h.session.dispose();
  pending.resolve(response({ token: 'late-token' }));
  await starting;
  assert.equal(h.clients.length, 0);
  assert.equal(h.state(), before);
});

test('unmount during instructions stops renewal and discards the result', async () => {
  const pending = deferred();
  const entered = deferred();
  const h = harness({ instructions: () => { entered.resolve(); return pending.promise; } });
  const starting = h.session.start('shop.customer.com', 'domains.example.com');
  await entered.promise;
  h.session.dispose();
  pending.resolve(result('shop.customer.com'));
  await starting;
  assert.equal(h.clients[0].stopped, true);
  assert.equal(h.state().result, null);
});

test('an expired renewal invalidates an in-flight check and offers a fresh session', async () => {
  const pending = deferred();
  const h = harness({ verify: () => pending.promise });
  await h.session.start('shop.customer.com', 'domains.example.com');
  const checking = h.session.verify();
  h.clients[0].config.onError({ code: 'token_expired', message: 'expired' });
  pending.resolve({ records: [{ match: true }] });
  await checking;
  assert.equal(h.state().error.restart, true);
  assert.equal(h.state().check, null);
  assert.equal(h.clients[0].stopped, true);
  await h.session.start('shop.customer.com', 'domains.example.com');
  assert.equal(h.state().error, null);
  assert.equal(h.clients.length, 2);
  h.session.dispose();
});

test('temporary renewal failure stays visible until renewal succeeds', async () => {
  const h = harness();
  await h.session.start('shop.customer.com', 'domains.example.com');
  h.clients[0].config.onError({ code: 'network_error', message: 'offline' });
  assert.ok(h.state().renewalWarning);
  h.clients[0].config.onTokenRenewed('renewed-token');
  assert.equal(h.state().renewalWarning, null);
  h.session.dispose();
});

test('verification failure offers retry without losing instructions; no match stays distinct', async () => {
  let calls = 0;
  const h = harness({ verify: async () => { if (++calls === 1) throw { code: 'network_error', message: 'offline' }; return { records: [{ match: false, actual_values: false }] }; } });
  await h.session.start('shop.customer.com', 'domains.example.com');
  await h.session.verify();
  assert.equal(h.state().error.operation, 'verify');
  assert.ok(h.state().result);
  await h.session.verify();
  assert.equal(h.state().phase, 'failed');
  assert.equal(h.state().error, null);
  assert.equal(h.clients[0].stopped, false);
  h.session.dispose();
});

test('partial results preserve individual record values for the UI', async () => {
  const records = [{ match: true, actual_values: ['domains.example.com'] }, { match: false, actual_values: false }];
  const h = harness({ verify: async () => ({ records }) });
  await h.session.start('shop.customer.com', 'domains.example.com');
  await h.session.verify();
  assert.equal(h.state().phase, 'partial');
  assert.deepEqual(h.state().check.records, records);
  h.session.dispose();
});

test('token endpoint failures and invalid payloads produce an actionable error', async () => {
  for (const reply of [response({ error: 'no_key' }, 503), response({ token: '' })]) {
    const h = harness({ fetchImpl: async () => reply });
    await h.session.start('shop.customer.com', 'domains.example.com');
    assert.equal(h.state().phase, 'error');
    assert.equal(h.state().error.operation, 'start');
    assert.equal(h.clients.length, 0);
  }
});
