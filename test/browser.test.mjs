import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('entry page loads the v2 headless client', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  assert.match(html, /dnswidget\/headless\.v2\.js/);
  assert.doesNotMatch(html, /dnswidget\/headless\.v1\.js/);
});
