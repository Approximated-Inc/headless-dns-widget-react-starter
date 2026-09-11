import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextDesign, guidedSteps } from '../shared/design.js';

test('horizontal tab navigation wraps and Home/End reach the boundary designs', () => {
  assert.equal(nextDesign('simple', 'ArrowRight'), 'dashboard');
  assert.equal(nextDesign('dashboard', 'ArrowRight'), 'guided');
  assert.equal(nextDesign('guided', 'ArrowRight'), 'simple');
  assert.equal(nextDesign('simple', 'ArrowLeft'), 'guided');
  assert.equal(nextDesign('guided', 'ArrowLeft'), 'dashboard');
  assert.equal(nextDesign('dashboard', 'ArrowLeft'), 'simple');
  assert.equal(nextDesign('dashboard', 'Home'), 'simple');
  assert.equal(nextDesign('simple', 'End'), 'guided');
});

test('unhandled tab keys preserve native scrolling and focus behavior', () => {
  for (const key of ['Tab', 'ArrowDown', 'Enter', 'Escape']) {
    assert.equal(nextDesign('dashboard', key), null);
  }
});

test('guidance starts at the domain step and does not claim records are prepared while loading', () => {
  for (const phase of ['idle', 'loading', 'error']) {
    assert.deepEqual(guidedSteps({ phase, result: null, check: null, error: null }).map((step) => step.state), ['current', 'waiting', 'waiting']);
  }
});

test('received instructions prepare record entry without claiming the DNS change is complete', () => {
  assert.deepEqual(guidedSteps({ phase: 'ready', result: {}, check: null, error: null }).map((step) => step.state), ['complete', 'current', 'waiting']);
});

test('checking, failed matches and verify errors keep verification current without completing record changes', () => {
  const states = [
    { phase: 'checking', check: null, error: null },
    { phase: 'partial', check: { records: [{ match: false }] }, error: null },
    { phase: 'failed', check: { records: [{ match: false }] }, error: null },
    { phase: 'ready', check: null, error: { operation: 'verify' } }
  ];
  for (const state of states) {
    assert.deepEqual(guidedSteps({ ...state, result: {} }).map((step) => step.state), ['complete', 'waiting', 'current']);
  }
});

test('all guided steps complete only after DNS verification succeeds', () => {
  assert.deepEqual(guidedSteps({ phase: 'complete', result: {}, check: { records: [{ match: true }] }, error: null }).map((step) => step.state), ['complete', 'complete', 'complete']);
});
