import { useId, useRef, useState } from 'react';
import { safeLink, recordAddress, actualValues, verificationMessages } from '../shared/session.js';

function ExternalLink({ href, children, className }) {
  const url = safeLink(href);
  return url ? <a href={url} className={className} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
}

function FieldStep({ step, compact = false }) {
  const id = useId();
  const input = useRef(null);
  const [message, setMessage] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(step.value); setMessage('Copied'); }
    catch { input.current?.select(); setMessage('Select and copy this value.'); }
  }
  if (step.value === '') return <div className="field-step blank-field">
    {compact && <span className="field-label">{step.label}</span>}
    <p>{step.text}</p>
  </div>;
  return <div className="field-step">
    <label className="field-label" htmlFor={id}>{compact ? step.label : step.text}</label>
    <div className="copy-field">
      <input id={id} ref={input} aria-label={step.label} value={step.value} readOnly />
      <button type="button" className="secondary" onClick={copy} aria-label={`Copy ${step.label}`}>Copy</button>
    </div>
    {compact && <p className="field-help">{step.text}</p>}
    <span className="copy-status" role="status">{message}</span>
  </div>;
}

function InstructionStep({ step, compact }) {
  if (step.kind === 'link') return <ExternalLink href={step.url}>{step.text}</ExternalLink>;
  if (step.kind !== 'field') return <p>{step.text}</p>;
  if (!compact) return <FieldStep step={step} />;
  return <p>{step.text}{step.value !== '' && <> <code>{step.value}</code></>}</p>;
}

function automationUrl(record) {
  return record.automation?.kind === 'domain_connect' ? safeLink(record.automation.url) : null;
}

function ProviderCopy({ provider }) {
  return <div className="provider-copy">
    <p>{provider.message}</p>
    {provider.message_link && <p><ExternalLink href={provider.message_link.url}>{provider.message_link.text}</ExternalLink></p>}
    {safeLink(provider.login_url) && <p><ExternalLink href={provider.login_url}>Open {provider.name || 'your provider’s'} DNS settings</ExternalLink></p>}
    {provider.lookup_status !== 'ok' && <p className="notice">We could not complete the provider lookup. Use these general instructions, check the domain spelling, or reload the instructions.</p>}
  </div>;
}

function AutomaticSetup({ group, automaticRecords }) {
  const headingId = useId();
  const providerName = group.provider.name || 'your DNS provider';
  const multiple = automaticRecords.length > 1;
  const manualRecords = group.records.filter((record) => !automationUrl(record));
  return <section className="automatic-setup" aria-labelledby={headingId}>
    <h3 id={headingId}>Set up DNS automatically</h3>
    <p>Click {multiple ? 'each button' : 'the button'} below to review and approve {multiple ? 'each DNS change' : 'this DNS change'} at {providerName}. Then return here to verify.</p>
    <p className="automatic-hint">The provider opens in a new tab.{multiple && ' Each approval sets up only the record shown.'}</p>
    <ul className="automatic-actions">{automaticRecords.map((record, index) => <li key={`${record.domain}-${record.type}-${record.host}-${index}`}>
      <span className="automatic-record-label">{record.type} {recordAddress(record)}</span>
      <ExternalLink href={automationUrl(record)} className="automatic-setup-button">
        {multiple ? `Set up ${record.type} ${recordAddress(record)} with ${providerName}` : `Set up with ${providerName}`}
        <span className="visually-hidden"> (opens in a new tab)</span>
      </ExternalLink>
    </li>)}</ul>
    {manualRecords.length > 0 && <p className="manual-required-copy">Still needs manual setup: {manualRecords.map((record) => `${record.type} ${recordAddress(record)}`).join(', ')}. Follow the manual steps below for {manualRecords.length === 1 ? 'this record' : 'these records'}.</p>}
  </section>;
}

function RecordFields({ record }) {
  return <div className="record-fields">{record.steps.filter((step) => step.kind === 'field').map((step, index) => <FieldStep key={index} step={step} compact />)}</div>;
}

export function ProviderInstructions({ result, design }) {
  const compact = design === 'dashboard';
  return result.domains.map((group) => {
    const automaticRecords = group.records.filter((record) => automationUrl(record));
    const hasAutomation = automaticRecords.length > 0;
    return <section className="panel provider-panel" key={group.apex_domain}>
      <div className="provider-heading">
        <div><p className="eyebrow">DNS provider</p><h2>{group.apex_domain}</h2></div>
        {group.provider.name && <span className="status-badge">{group.provider.name}</span>}
      </div>
      {hasAutomation ? <AutomaticSetup group={group} automaticRecords={automaticRecords} /> : <ProviderCopy provider={group.provider} />}
      {group.records.map((record, recordIndex) => {
        const automatic = Boolean(automationUrl(record));
        return <article className="record" key={`${record.domain}-${record.type}-${record.host}-${recordIndex}`}>
          <div className="record-heading"><h3>{automatic ? recordAddress(record) : record.title}</h3><span className="record-type">{record.type}</span></div>
          {hasAutomation && !automatic && <ProviderCopy provider={group.provider} />}
          {compact && !automatic && <RecordFields record={record} />}
          <details className="manual-steps" open={!automatic && !compact ? true : undefined}>
            <summary>{automatic ? 'Set up manually instead' : compact ? 'Provider instructions and manual steps' : 'Manual steps'}</summary>
            {hasAutomation && automatic && <ProviderCopy provider={group.provider} />}
            {compact && automatic && <RecordFields record={record} />}
            <ol className="steps">{record.steps.map((step, index) => <li key={index}><InstructionStep step={step} compact={compact} /></li>)}</ol>
          </details>
        </article>;
      })}
    </section>;
  });
}

export function DomainForm({ domain, onDomainChange, target, phase, busy, start }) {
  return <form id="domain-form" className="panel domain-panel" onSubmit={(event) => { event.preventDefault(); start(); }}>
    <h2>Domain details</h2>
    <label htmlFor="domain">Your custom domain</label>
    <input id="domain" name="domain" type="text" autoCapitalize="none" autoCorrect="off" spellCheck="false" required value={domain}
      onChange={(event) => onDomainChange(event.target.value)} aria-describedby="domain-help" />
    <p id="domain-help" className="muted">For example, shop.customer.com. The CNAME target is <code>{target}</code>.</p>
    <button id="load-instructions" type="submit" disabled={busy}>{phase === 'loading' ? 'Loading instructions…' : 'Get setup instructions'}</button>
  </form>;
}

export function SessionNotices({ state, busy, retry }) {
  return <div className="session-notices">
    <div aria-live="polite" role="status">{state.phase === 'loading' && <p>Finding your DNS provider and preparing the steps…</p>}</div>
    {state.renewalWarning && <p className="notice" role="status">{state.renewalWarning}</p>}
    {state.error && <section className="panel error" role="alert">
      <p>{state.error.message}</p>
      {state.error.details.length > 0 && <ul>{state.error.details.map((detail, index) => <li key={index}>Record {detail.index + 1}, {detail.field}: {detail.message}</li>)}</ul>}
      <button id="retry-request" type="button" onClick={retry} disabled={busy}>{state.error.restart ? 'Restart setup' : 'Try again'}</button>
    </section>}
  </div>;
}

export function VerificationPanel({ state, busy, verify, start }) {
  return <section className="panel verification-panel" aria-labelledby="verify-heading">
    <h2 id="verify-heading">Check your DNS changes</h2>
    <p>Complete setup at your DNS provider, then check the records here. DNS updates can take time to become visible.</p>
    <div className="actions">
      <button id="verify-records" type="button" onClick={verify} disabled={busy || state.phase === 'complete' || state.error?.restart}>
        {state.phase === 'checking' ? 'Checking DNS…' : state.phase === 'complete' ? 'DNS verified' : 'Check DNS records'}
      </button>
      <button id="reload-instructions" type="button" className="secondary" onClick={start} disabled={busy}>Reload instructions</button>
    </div>
    <p id="verification-status" role="status" aria-live="polite">{state.phase === 'checking' ? 'Looking up the current DNS records…' : verificationMessages[state.phase]}</p>
    {state.check && <ul id="verification-records" className="checks">{state.check.records.map((record, index) => <li key={index} data-match={record.match === true}>
      <strong>{recordAddress(record)} · {record.type}</strong>
      <span>{record.match === true ? 'Matches' : 'Not matched yet'}</span>
      <div>Expected: <code>{record.match_against}</code></div>
      <div>Found: <code>{actualValues(record)}</code></div>
    </li>)}</ul>}
  </section>;
}

export function GuideSection({ number, title, step, children }) {
  return <section className="guide-section" data-step-state={step.state} aria-labelledby={`guide-heading-${number}`}>
    <div className="guide-heading">
      <span className="step-number" role="img" aria-label={`Step ${number}${step.state === 'complete' ? ', complete' : step.state === 'current' ? ', current' : ''}`}>{step.state === 'complete' ? '✓' : number}</span>
      <div><h2 id={`guide-heading-${number}`}>{title}</h2><p className="step-caption">{step.caption}</p></div>
    </div>
    <div className="guide-content">{children}</div>
  </section>;
}
