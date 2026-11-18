import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseModelId, pickReplacement, buildUpgradeNotice } from '../src/services/model-resolver.ts';

const m = (id: string, endpoints: string[] = ['/chat/completions'], preview = false) =>
  ({ id, preview, supported_endpoints: endpoints });

const catalog = [
  m('claude-opus-5'), m('claude-opus-5.5'), m('claude-opus-4.8-fast'),
  m('claude-sonnet-5'), m('claude-sonnet-5.5'), m('claude-haiku-4.5'),
  m('gpt-5.3-codex', ['/responses']), m('gpt-6-sol', ['/responses']),
  m('gpt-4o'), m('gpt-4o-2024-11-20'), m('claude-opus-6', ['/chat/completions'], true),
];

test('parseModelId splits family and version', () => {
  assert.deepEqual(parseModelId('claude-opus-4.6'), { family: 'claude-opus', version: [4, 6] });
  assert.deepEqual(parseModelId('claude-opus-4.8-fast'), { family: 'claude-opus-fast', version: [4, 8] });
  assert.deepEqual(parseModelId('gpt-6-sol'), { family: 'gpt-sol', version: [6] });
  assert.deepEqual(parseModelId('gpt-4o-2024-11-20'), { family: 'gpt-4o', version: null });
});

test('retired model upgrades to newest non-preview same-family model', () => {
  assert.equal(pickReplacement('claude-opus-4.6', catalog), 'claude-opus-5.5');
  assert.equal(pickReplacement('claude-sonnet-4.6', catalog), 'claude-sonnet-5.5');
});

test('tier and suffix must match', () => {
  assert.equal(pickReplacement('claude-opus-4.5-fast', catalog), 'claude-opus-4.8-fast');
  assert.equal(pickReplacement('claude-haiku-4', catalog), 'claude-haiku-4.5');
});

test('never downgrades', () => {
  assert.equal(pickReplacement('claude-opus-5.9', catalog), 'claude-opus-6'); // only preview is newer
  assert.equal(pickReplacement('claude-sonnet-9', catalog), null);
});

test('no cross-family jumps (gpt-5.5 has no gpt-* successor)', () => {
  assert.equal(pickReplacement('gpt-5.5', catalog), null);
});

test('requireChat filters out /responses-only models', () => {
  assert.equal(pickReplacement('gpt-5.2-codex', catalog), 'gpt-5.3-codex');
  assert.equal(pickReplacement('gpt-5.2-codex', catalog, true), null);
});

test('unversioned ids are never rerouted', () => {
  assert.equal(pickReplacement('gpt-4o-mini', catalog), null);
});

test('upgrade notice only when rerouted', () => {
  assert.equal(buildUpgradeNotice({ model: 'x', requested: 'x', rerouted: false, retired: false }), null);
  const n = buildUpgradeNotice({ model: 'claude-opus-5.5', requested: 'claude-opus-4.6', rerouted: true, retired: true })!;
  assert.equal(n.name, 'claude-opus-5.5');
  assert.equal(n.requested, 'claude-opus-4.6');
  assert.match(n.message, /retired.*claude-opus-5\.5.*keep redirecting/);
});

import { pickLatest } from '../src/services/model-resolver.ts';

test('-latest picks newest active, non-preview model in family', () => {
  assert.equal(pickLatest('claude-sonnet-latest', catalog), 'claude-sonnet-5.5');
  assert.equal(pickLatest('claude-opus-latest', catalog), 'claude-opus-5.5'); // opus-6 is preview
  assert.equal(pickLatest('claude-opus-fast-latest', catalog), 'claude-opus-4.8-fast');
  assert.equal(pickLatest('claude-haiku-latest', catalog), 'claude-haiku-4.5');
});

test('-latest respects API key scopes when possible', () => {
  assert.equal(pickLatest('claude-sonnet-latest', catalog, false, ['claude-sonnet-5', 'gpt-4o']), 'claude-sonnet-5');
  // nothing in scope → newest overall (scope check then returns a clear 403)
  assert.equal(pickLatest('claude-sonnet-latest', catalog, false, ['gpt-4o']), 'claude-sonnet-5.5');
});

test('-latest honours requireChat and ignores non-latest ids', () => {
  assert.equal(pickLatest('gpt-codex-latest', catalog), 'gpt-5.3-codex');
  assert.equal(pickLatest('gpt-codex-latest', catalog, true), null);
  assert.equal(pickLatest('claude-sonnet-5', catalog), null);
  assert.equal(pickLatest('mistral-latest', catalog), null);
});

test('no upgrade notice for -latest', () => {
  assert.equal(buildUpgradeNotice({ model: 'claude-sonnet-5.5', requested: 'claude-sonnet-latest', rerouted: true, retired: false, reason: 'latest' }), null);
});

test('always-latest: versioned ids map to newest in family via -latest picker', () => {
  // resolveModel builds `${family}-latest` from the requested id
  assert.equal(pickLatest(`${parseModelId('claude-sonnet-5').family}-latest`, catalog), 'claude-sonnet-5.5');
  assert.equal(pickLatest(`${parseModelId('claude-opus-4.8-fast').family}-latest`, catalog), 'claude-opus-4.8-fast');
  // key scoped to sonnet-5.5 + haiku asking for sonnet-5 → sonnet-5.5
  assert.equal(pickLatest('claude-sonnet-latest', catalog, false, ['claude-sonnet-5.5', 'claude-haiku-4.5']), 'claude-sonnet-5.5');
});

test('equal versions prefer the base id over dated snapshots', () => {
  const c = [m('gpt-4.1'), m('gpt-4.1-2025-04-14'), m('gpt-4')];
  assert.equal(pickLatest('gpt-latest', c), 'gpt-4.1');
});
