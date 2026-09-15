export const initialState = () => ({
  phase: 'idle', result: null, check: null, error: null, renewalWarning: null
});

const expired = (error) => ['token_expired', 'missing_token'].includes(error?.code);
function describeError(error, operation) {
  return {
    operation,
    restart: expired(error),
    message: expired(error)
      ? 'Your setup session expired. Restart setup to get a fresh token.'
      : error?.message || 'The request could not finish. Please try again.',
    details: Array.isArray(error?.details) ? error.details : []
  };
}

// React and Vue own the UI; this module owns the active client and request lifetime.
export function createDnsSetup({ onChange, createClient, fetchImpl = globalThis.fetch }) {
  let state = initialState();
  let generation = 0;
  let disposed = false;
  let client = null;
  let controller = null;
  const current = (id) => !disposed && id === generation;
  function publish(patch) {
    if (!disposed) {
      state = { ...state, ...patch };
      onChange(state);
    }
  }
  function release() {
    generation += 1;
    client?.stop();
    client = null;
    controller?.abort();
    controller = null;
  }
  function reset() {
    release();
    publish(initialState());
  }

  async function start(domain, target) {
    if (disposed) return;
    reset();
    const id = generation;
    controller = new AbortController();
    const signal = controller.signal;
    publish({ phase: 'loading' });
    try {
      const reply = await fetchImpl('/api/dns-widget-token', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', signal
      });
      if (!current(id)) return;
      if (!reply.ok) throw new Error('Could not start DNS setup. Check the token server and try again.');
      const { token } = await reply.json();
      if (!current(id)) return;
      if (typeof token !== 'string' || !token) throw new Error('The token server returned an invalid token.');
      const activeClient = createClient({
        token,
        api_url: 'https://cloud.approximated.app/api/dns/v2',
        fetch: (url, options) => fetchImpl(url, { ...options, signal }),
        onTokenRenewed: () => { if (current(id)) publish({ renewalWarning: null }); },
        onError: (error) => {
          if (!current(id)) return;
          if (expired(error)) {
            release();
            publish({ phase: state.result ? 'ready' : 'error', check: null, error: describeError(error, 'start'), renewalWarning: null });
          } else {
            publish({ renewalWarning: 'We could not refresh your session. We will retry automatically; restart setup if it expires.' });
          }
        }
      });
      client = activeClient;
      const result = await activeClient.instructions({
        domain: domain.trim(),
        records: [{ type: 'CNAME', host: '@', value: target, ttl: 3600 }]
      });
      if (current(id)) publish({ phase: 'ready', result });
    } catch (error) {
      if (!current(id)) return;
      release();
      publish({ phase: 'error', error: describeError(error, 'start') });
    }
  }

  async function verify() {
    if (disposed || !client || !state.result || state.phase === 'checking') return;
    const id = generation;
    const activeClient = client;
    publish({ phase: 'checking', check: null, error: null });
    try {
      const check = await activeClient.verify(state.result);
      if (!current(id)) return;
      const phase = activeClient.summarize(check.records);
      if (phase === 'complete') release();
      publish({ phase, check, renewalWarning: phase === 'complete' ? null : state.renewalWarning });
    } catch (error) {
      if (!current(id)) return;
      if (expired(error)) release();
      publish({ phase: 'ready', error: describeError(error, 'verify') });
    }
  }

  return { start, verify, reset, dispose() { disposed = true; release(); } };
}

export function safeLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function recordAddress(record) {
  return record.host === '@' ? record.domain : `${record.host}.${record.domain}`;
}

export function actualValues(record) {
  return Array.isArray(record.actual_values) && record.actual_values.length
    ? record.actual_values.join(', ') : 'No records found';
}

export const verificationMessages = {
  complete: 'All DNS records match. Your application can now check routing and HTTPS.',
  partial: 'Some DNS records match. Check the remaining values, then try again.',
  failed: 'No DNS records match yet. Check the values below, allow time for DNS updates, then try again.'
};
