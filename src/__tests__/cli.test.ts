import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PasteBuffer, assess, selectCookies, shouldAlert } from '../cli.js';
import type { KeepAliveState } from '../services/keepalive.service.js';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const future = NOW / 1000 + 3600;

// --- import-cookies ----------------------------------------------------------

test('selectCookies keeps the store and SSO session cookies only', () => {
  const www = [
    { name: 'FRO_SESSION_ID', value: 'x', domain: 'www.carrefour.fr' },
    { name: 'FRO_STORE', value: 'x', domain: '.carrefour.fr', expirationDate: future },
    { name: '_ga', value: 'x', domain: '.carrefour.fr' },
  ];
  const iam = [
    { name: 'c4iamsecuretk', value: 'x', domain: 'moncompte.carrefour.fr' },
    { name: 'amlbcookie', value: 'x' },
    { name: 'FRO_SESSION_ID', value: 'x', domain: 'moncompte.carrefour.fr' },
  ];
  const { kept, dropped } = selectCookies([www, iam], NOW);
  assert.deepEqual(
    kept.map((c) => `${c.name}@${c.domain}`).sort(),
    [
      'FRO_SESSION_ID@www.carrefour.fr',
      'FRO_STORE@carrefour.fr',
      'amlbcookie@moncompte.carrefour.fr',
      'c4iamsecuretk@moncompte.carrefour.fr',
    ]
  );
  assert.deepEqual(dropped, ['FRO_SESSION_ID', '_ga']);
});

test('selectCookies drops expired cookies and dedupes repeated ones', () => {
  const { kept, expired } = selectCookies(
    [
      [
        { name: 'FRO_A', value: 'old', expirationDate: NOW / 1000 - 10 },
        { name: 'FRO_B', value: '1' },
        { name: 'FRO_B', value: '2' },
      ],
    ],
    NOW
  );
  assert.deepEqual(expired, ['FRO_A']);
  assert.deepEqual(
    kept.map((c) => [c.name, c.value]),
    [['FRO_B', '2']]
  );
});

test('PasteBuffer reads a JSON export pasted over several lines', () => {
  const p = new PasteBuffer();
  assert.equal(p.push('['), null);
  assert.equal(p.push('  {"name": "FRO_SESSION_ID", "value": "x"}'), null);
  const done = p.push(']');
  assert.ok(Array.isArray(done));
  assert.equal(done[0].name, 'FRO_SESSION_ID');
});

test('PasteBuffer: Enter alone skips, a header line is read at once, a broken paste restarts', () => {
  assert.equal(new PasteBuffer().push(''), 'skip');
  assert.deepEqual(new PasteBuffer().push('a=1; b=2'), [
    { name: 'a', value: '1' },
    { name: 'b', value: '2' },
  ]);
  const p = new PasteBuffer();
  assert.equal(p.push('[{"name": "a"'), null);
  assert.equal(p.push(''), 'invalid');
  assert.equal(p.push(''), 'skip');
});

// --- check-session -----------------------------------------------------------

const state = (over: Partial<KeepAliveState>): KeepAliveState => ({
  lastCheck: new Date(NOW - 10 * 60_000).toISOString(),
  outcome: 'ok',
  intervalMinutes: 30,
  ...over,
});

test('assess: ok, expired, no-session and errors', () => {
  assert.deepEqual(assess(state({}), NOW), { verdict: 'ok', message: '' });
  assert.equal(assess(state({ outcome: 'expired' }), NOW).verdict, 'expired');
  assert.equal(assess(state({ outcome: 'no-session' }), NOW).verdict, 'expired');
  assert.match(assess(state({ outcome: 'expired' }), NOW).message, /import-cookies/);
  const err = assess(state({ outcome: 'error', reason: 'HTTP 500' }), NOW);
  assert.equal(err.verdict, 'error');
  assert.match(err.message, /HTTP 500/);
});

test('assess: a missing or old record means the server is not keeping the session alive', () => {
  assert.equal(assess(null, NOW).verdict, 'stale');
  const old = state({ lastCheck: new Date(NOW - 120 * 60_000).toISOString() });
  assert.equal(assess(old, NOW).verdict, 'stale');
  assert.equal(assess(old, NOW, 180).verdict, 'ok');
  assert.equal(assess(state({ lastCheck: 'garbage' }), NOW).verdict, 'stale');
});

test('shouldAlert: one alert per episode, but an expiry always gets through', () => {
  assert.equal(shouldAlert('ok', 'expired'), false);
  assert.equal(shouldAlert('expired', null), true);
  assert.equal(shouldAlert('expired', 'error'), true);
  assert.equal(shouldAlert('expired', 'expired'), false);
  assert.equal(shouldAlert('error', null), true);
  assert.equal(shouldAlert('error', 'error'), false);
  assert.equal(shouldAlert('stale', 'expired'), false);
});
