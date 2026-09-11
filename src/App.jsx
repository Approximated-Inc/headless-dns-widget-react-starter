import { useEffect, useId, useRef, useState } from 'react';
import { createDnsSetup, initialState, safeLink, recordAddress, actualValues, verificationMessages } from '../shared/session.js';
import { cnameTarget, createClient } from '../shared/browser.js';

function ExternalLink({ href, children }) {
  const url = safeLink(href);
  return url ? <a href={url} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
}

function FieldStep({ step }) {
  const id = useId();
  const input = useRef(null);
  const [message, setMessage] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(step.value); setMessage('Copied'); }
    catch { input.current?.select(); setMessage('Select and copy this value.'); }
  }
  if (step.value === '') return <p>{step.text}</p>;
  return <div className="field-step">
    <label htmlFor={id}>{step.text}</label>
    <div className="copy-field">
      <input id={id} ref={input} aria-label={step.label} value={step.value} readOnly />
      <button type="button" className="secondary" onClick={copy} aria-label={`Copy ${step.label}`}>Copy</button>
    </div>
    <span className="copy-status" role="status">{message}</span>
  </div>;
}

function ProviderInstructions({ result }) {
  return result.domains.map((group) => <section className="panel" key={group.apex_domain}>
    <h2>{group.apex_domain}</h2>
    <p>{group.provider.message}</p>
    {group.provider.message_link && <p><ExternalLink href={group.provider.message_link.url}>{group.provider.message_link.text}</ExternalLink></p>}
    {safeLink(group.provider.login_url) && <p><ExternalLink href={group.provider.login_url}>Open {group.provider.name} DNS settings</ExternalLink></p>}
    {group.provider.lookup_status !== 'ok' && <p className="notice">We could not complete the provider lookup. Use these general instructions, check the domain spelling, or reload the instructions.</p>}
    {group.records.map((record, recordIndex) => <article className="record" key={`${record.domain}-${record.type}-${record.host}-${recordIndex}`}>
      <h3>{record.title}</h3>
      {safeLink(record.automation?.url) && <p><ExternalLink href={record.automation.url}>Set up this record automatically</ExternalLink></p>}
      <details open={!safeLink(record.automation?.url)}>
        <summary>Manual steps</summary>
        <ol className="steps">{record.steps.map((step, index) => <li key={index}>
          {step.kind === 'field' ? <FieldStep step={step} /> : step.kind === 'link'
            ? <ExternalLink href={step.url}>{step.text}</ExternalLink> : <p>{step.text}</p>}
        </li>)}</ol>
      </details>
    </article>)}
  </section>);
}

export default function App() {
  const [domain, setDomain] = useState('shop.customer.com');
  const [state, setState] = useState(initialState);
  const session = useRef(null);
  useEffect(() => {
    const activeSession = createDnsSetup({ onChange: setState, createClient });
    session.current = activeSession;
    return () => { activeSession.dispose(); session.current = null; };
  }, []);
  const busy = state.phase === 'loading' || state.phase === 'checking';
  const start = () => session.current?.start(domain, cnameTarget);
  const retry = () => state.error?.operation === 'verify' && !state.error.restart ? session.current?.verify() : start();

  return <main>
    <header><p className="eyebrow">Custom domain setup</p><h1>Connect your domain</h1><p>Add a DNS record to point your domain to this application.</p></header>
    <form id="domain-form" className="panel" onSubmit={(event) => { event.preventDefault(); start(); }}>
      <label htmlFor="domain">Your custom domain</label>
      <input id="domain" name="domain" type="text" autoCapitalize="none" autoCorrect="off" spellCheck="false" required value={domain}
        onChange={(event) => { setDomain(event.target.value); session.current?.reset(); }} aria-describedby="domain-help" />
      <p id="domain-help" className="muted">For example, shop.customer.com. The CNAME target is <code>{cnameTarget}</code>.</p>
      <button id="load-instructions" type="submit" disabled={busy}>{state.phase === 'loading' ? 'Loading instructions…' : 'Get setup instructions'}</button>
    </form>
    <div aria-live="polite" role="status">{state.phase === 'loading' && <p>Finding your DNS provider and preparing the steps…</p>}</div>
    {state.renewalWarning && <p className="notice" role="status">{state.renewalWarning}</p>}
    {state.error && <section className="panel error" role="alert">
      <p>{state.error.message}</p>
      {state.error.details.length > 0 && <ul>{state.error.details.map((detail, index) => <li key={index}>Record {detail.index + 1}, {detail.field}: {detail.message}</li>)}</ul>}
      <button id="retry-request" type="button" onClick={retry} disabled={busy}>{state.error.restart ? 'Restart setup' : 'Try again'}</button>
    </section>}
    {state.result && <>
      <div id="provider-instructions"><ProviderInstructions result={state.result} /></div>
      <section className="panel" aria-labelledby="verify-heading">
        <h2 id="verify-heading">Check your DNS changes</h2>
        <p>Save the record at your DNS provider, then check it here. DNS updates can take time to become visible.</p>
        <div className="actions">
          <button id="verify-records" type="button" onClick={() => session.current?.verify()} disabled={busy || state.phase === 'complete' || state.error?.restart}>
            {state.phase === 'checking' ? 'Checking DNS…' : state.phase === 'complete' ? 'DNS verified' : 'Check DNS records'}
          </button>
          <button type="button" className="secondary" onClick={start} disabled={busy}>Reload instructions</button>
        </div>
        <p id="verification-status" role="status" aria-live="polite">{state.phase === 'checking' ? 'Looking up the current DNS records…' : verificationMessages[state.phase]}</p>
        {state.check && <ul id="verification-records" className="checks">{state.check.records.map((record, index) => <li key={index}>
          <strong>{recordAddress(record)} · {record.type}</strong>
          <span>{record.match === true ? 'Matches' : 'Not matched yet'}</span>
          <div>Expected: <code>{record.match_against}</code></div>
          <div>Found: <code>{actualValues(record)}</code></div>
        </li>)}</ul>}
      </section>
    </>}
  </main>;
}
