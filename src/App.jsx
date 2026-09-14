import { useEffect, useRef, useState } from 'react';
import { createDnsSetup, initialState } from '../shared/session.js';
import { cnameTarget, createClient } from '../shared/browser.js';
import { designOptions, nextDesign, guidedSteps } from '../shared/design.js';
import { DomainForm, ProviderInstructions, SessionNotices, VerificationPanel, GuideSection } from './components.jsx';

function DesignTabs({ design, onChange }) {
  const tabs = useRef({});
  function navigate(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = nextDesign(design, event.key);
    if (!next) return;
    event.preventDefault();
    onChange(next);
    tabs.current[next]?.focus();
  }
  return <div className="design-picker">
    <span className="design-label" id="design-label">Choose a design</span>
    <div className="design-tabs" role="tablist" aria-labelledby="design-label" onKeyDown={navigate}>
      {designOptions.map((option) => <button type="button" className="design-tab" role="tab" key={option.id}
        id={`design-tab-${option.id}`} ref={(node) => { tabs.current[option.id] = node; }}
        aria-selected={design === option.id} aria-controls="dns-design-panel" tabIndex={design === option.id ? 0 : -1}
        onClick={() => onChange(option.id)}>{option.label}</button>)}
    </div>
    <p className="design-description">{designOptions.find((option) => option.id === design).description}</p>
  </div>;
}

const phaseLabels = {
  idle: 'Awaiting instructions', loading: 'Loading instructions', ready: 'Instructions ready',
  error: 'Needs attention', checking: 'Checking DNS', complete: 'DNS verified', partial: 'Partially matched', failed: 'Not matched yet'
};

export default function App() {
  const [domain, setDomain] = useState('shop.customer.com');
  const [state, setState] = useState(initialState);
  const [design, setDesign] = useState('simple');
  const session = useRef(null);
  // Design selection never recreates the client or interrupts its active requests.
  useEffect(() => {
    const activeSession = createDnsSetup({ onChange: setState, createClient });
    session.current = activeSession;
    return () => { activeSession.dispose(); session.current = null; };
  }, []);
  const busy = state.phase === 'loading' || state.phase === 'checking';
  const start = () => session.current?.start(domain, cnameTarget);
  const retry = () => state.error?.operation === 'verify' && !state.error.restart ? session.current?.verify() : start();
  const changeDomain = (value) => { setDomain(value); session.current?.reset(); };
  const form = <DomainForm domain={domain} onDomainChange={changeDomain} target={cnameTarget} phase={state.phase} busy={busy} start={start} />;
  const notices = <SessionNotices state={state} busy={busy} retry={retry} />;
  const instructions = state.result && <div id="provider-instructions"><ProviderInstructions result={state.result} design={design} /></div>;
  const verification = state.result && <VerificationPanel state={state} busy={busy} verify={() => session.current?.verify()} start={start} />;
  const guide = guidedSteps(state);

  return <main data-design={design}>
    <header className="demo-header"><p className="eyebrow">Custom domain setup</p><h1>Connect your domain</h1><p>Set up DNS to point your domain to this application.</p></header>
    <DesignTabs design={design} onChange={setDesign} />
    <div id="dns-design-panel" className="design-panel" role="tabpanel" aria-labelledby={`design-tab-${design}`} tabIndex={0}>
      {design === 'guided' ? <div className="guided-layout">
        <GuideSection number={1} title="Choose your domain" step={guide[0]}>{form}{notices}</GuideSection>
        <GuideSection number={2} title="Set up your DNS records" step={guide[1]}>
          {instructions || <div className="empty-state"><p>Start with your domain above. We’ll find your provider and show your DNS setup options.</p></div>}
        </GuideSection>
        <GuideSection number={3} title="Make sure your DNS records match" step={guide[2]}>
          {verification || <div className="empty-state"><p>After saving your changes, return here to check the records. We’ll show exactly what DNS returns.</p></div>}
        </GuideSection>
      </div> : <div className="setup-layout">
        <div className="setup-controls">
          {form}{notices}
          {design === 'dashboard' && <p className="sidebar-note"><strong>Your provider stays in control</strong>Review and approve automatic setup at your DNS provider, or follow the manual steps.</p>}
        </div>
        <div className="setup-workspace">
          {design === 'dashboard' && <div className="workspace-header">
            <div><h2>DNS records</h2><p>Provider instructions and verification</p></div>
            <span className="status-badge" data-phase={state.phase}>{state.error ? 'Needs attention' : phaseLabels[state.phase]}</span>
          </div>}
          {instructions || <div className="empty-state">
            {design === 'dashboard' && <span className="empty-symbol" aria-hidden="true">↗</span>}
            <h2>{design === 'dashboard' ? 'Your record workspace is ready' : 'Your setup steps will appear here'}</h2>
            <p>Enter your custom domain and get the instructions to see your DNS provider and the exact record values.</p>
          </div>}
          {verification}
        </div>
      </div>}
    </div>
  </main>;
}
