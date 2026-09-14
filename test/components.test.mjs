import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

// Exercise the shipped JSX through the same transform used by Vite, without a browser or new dependencies.
const componentFile = new URL('../src/components.jsx', import.meta.url);
const transformed = await transformWithOxc(await readFile(componentFile, 'utf8'), componentFile.pathname, { jsx: { runtime: 'automatic' } });
const code = transformed.code.replace(/from "([^"]+)"/g, (_, specifier) => {
  const resolved = specifier.startsWith('.') ? new URL(specifier, componentFile).href : import.meta.resolve(specifier);
  return `from ${JSON.stringify(resolved)}`;
});
const { ProviderInstructions, VerificationPanel } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const designs = ['simple', 'dashboard', 'guided'];
const provider = {
  name: 'Cloudflare', lookup_status: 'ok', message: 'Manage your records in your DNS provider account.',
  message_link: { text: 'Provider help', url: 'https://help.example.com/dns' },
  login_url: 'https://dash.cloudflare.com/example.com/dns'
};
function record(overrides = {}) {
  const data = {
    domain: 'example.com', host: 'shop', type: 'CNAME', title: 'Connect shop.example.com', value: 'domains.example.com', ttl: 3600,
    automation: { kind: 'domain_connect', url: 'https://connect.example.com/shop' },
    ...overrides
  };
  return { ...data, steps: overrides.steps || [
      { kind: 'link', text: 'Sign in to your DNS provider', url: provider.login_url },
      { kind: 'field', label: 'Host', text: 'Enter the host.', value: data.host },
      { kind: 'field', label: 'Value', text: 'Enter the target.', value: data.value }
    ]
  };
}
function render(records, design, dnsProvider = provider) {
  return renderToStaticMarkup(createElement(ProviderInstructions, {
    design, result: { domains: [{ apex_domain: 'example.com', provider: dnsProvider, records }] }
  }));
}
function articles(html) { return [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(([article]) => article); }
function details(html) { return [...html.matchAll(/<details\b[^>]*>[\s\S]*?<\/details>/g)].map(([detail]) => detail); }
function outsideDetails(html) { return html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, ''); }
function plainText(html) { return html.replace(/<[^>]*>/g, ''); }

for (const design of designs) {
  test(`${design}: automatic setup is the first action and all manual fields start collapsed`, () => {
    const html = render([record()], design);
    const [firstLink] = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/) || [];
    assert.ok(firstLink, 'automatic setup must be an actionable link');
    assert.match(firstLink, /href="https:\/\/connect.example.com\/shop"/);
    assert.match(firstLink, /class="automatic-setup-button"/);
    assert.match(firstLink, /target="_blank"/);
    assert.match(firstLink, /rel="noopener noreferrer"/);
    assert.equal(plainText(firstLink), "Set up automatically");
    assert.match(firstLink, /aria-label="Set up automatically: CNAME shop.example.com with Cloudflare/);
    assert.match(html, /Set up DNS automatically/);
    assert.match(html, /review and approve/i);
    assert.match(html, /return here to verify/i);
    assert.ok(html.indexOf('Set up DNS automatically') < html.indexOf('<article'), 'provider-group callout precedes records');
    const [manual] = details(html);
    assert.ok(manual);
    assert.doesNotMatch(manual.match(/^<details\b[^>]*>/)[0], /\bopen\b/);
    assert.match(manual, /<summary>Set up manually instead<\/summary>/);
    assert.match(manual, /Open Cloudflare DNS settings/);
    assert.match(manual, /aria-label="Copy Host"/);
    assert.match(manual, /value="domains.example.com"/);
    assert.doesNotMatch(outsideDetails(html), /<input\b|Open Cloudflare DNS settings|Provider help/);
  });

  test(`${design}: separate automatic records retain their own links and identified approvals`, () => {
    const html = render([
      record(),
      record({ host: 'www', title: 'Connect www.example.com', automation: { kind: 'domain_connect', url: 'https://connect.example.com/www' } })
    ], design);
    const primary = [...html.matchAll(/<a\b[^>]*class="automatic-setup-button"[^>]*>[\s\S]*?<\/a>/g)].map(([link]) => link);
    assert.equal(primary.length, 2);
    assert.match(primary[0], /href="https:\/\/connect.example.com\/shop"/);
    assert.match(primary[0], /aria-label="Set up automatically: CNAME shop.example.com/);
    assert.match(primary[1], /href="https:\/\/connect.example.com\/www"/);
    assert.match(primary[1], /aria-label="Set up automatically: CNAME www.example.com/);
    assert.match(html, /Each approval sets up only the record shown/);
    assert.equal(details(html).filter((manual) => !/\bopen\b/.test(manual.match(/^<details\b[^>]*>/)[0])).length, 2);
  });

  test(`${design}: mixed groups identify manual records while keeping their setup visible`, () => {
    const html = render([
      record(),
      record({ host: '_verification', type: 'TXT', title: 'Verify your domain', automation: null })
    ], design);
    const [automated, manual] = articles(html);
    const callout = html.slice(0, html.indexOf('<article'));
    assert.match(plainText(callout), /Still needs manual setup: TXT _verification.example.com/);
    assert.doesNotMatch(details(automated)[0].match(/^<details\b[^>]*>/)[0], /\bopen\b/);
    if (design === 'dashboard') assert.match(outsideDetails(manual), /<input\b/);
    else assert.match(details(manual)[0].match(/^<details\b[^>]*>/)[0], /\bopen\b/);
    assert.doesNotMatch(manual, /Set up manually instead/);
    assert.match(outsideDetails(manual), /Open Cloudflare DNS settings/);
  });

  test(`${design}: unsupported or unsafe automation preserves the manual setup path`, () => {
    for (const automation of [
      null,
      { url: 'https://connect.example.com/shop' },
      { kind: 'unknown', url: 'https://connect.example.com/shop' },
      { kind: 'domain_connect', url: 'javascript:alert(1)' },
      { kind: 'domain_connect', url: 'data:text/html,example' },
      { kind: 'domain_connect', url: '/relative' },
      { kind: 'domain_connect', url: 'http://connect.example.com/shop' },
      { kind: 'domain_connect', url: 'https://user:secret@connect.example.com/shop' },
      { kind: 'domain_connect', url: '' }
    ]) {
      const html = render([record({ automation })], design);
      assert.doesNotMatch(html, /automatic-setup|automation-link|Set up manually instead/);
      assert.match(outsideDetails(html), /Open Cloudflare DNS settings/);
      assert.match(html, /aria-label="Copy Host"/);
      if (design === 'dashboard') assert.match(outsideDetails(html), /<input\b/);
      else assert.match(details(html)[0].match(/^<details\b[^>]*>/)[0], /\bopen\b/);
      assert.doesNotMatch(html, /href="(?:javascript:|data:|\/relative)/);
    }
  });
}

test('automatic setup can name an unknown provider without rendering an empty label', () => {
  const html = render([record()], 'simple', { ...provider, name: null });
  assert.match(html, /aria-label="Set up automatically: CNAME shop.example.com with your DNS provider/);
});

test('the verified state still disables verification and reports matched records', () => {
  const html = renderToStaticMarkup(createElement(VerificationPanel, {
    state: { phase: 'complete', check: { records: [{ domain: 'example.com', host: 'shop', type: 'CNAME', match: true, match_against: 'domains.example.com', actual_values: ['domains.example.com'] }] } },
    busy: false, verify() {}, start() {}
  }));
  assert.match(html, /<button\b[^>]*id="verify-records"[^>]*disabled=""[^>]*>DNS verified<\/button>/);
  assert.match(html, /data-match="true"/);
  assert.match(html, /Matches/);
});
