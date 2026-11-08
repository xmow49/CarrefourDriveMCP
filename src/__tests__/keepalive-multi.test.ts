import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir, hostname } from 'os';
import { join } from 'path';
import { liveProfileLock, pickProfileDir, sweepPrivateProfiles } from '../services/browser.service.js';
import { claimKeepAliveLead, keepAliveTick, resetSsoMemo } from '../services/keepalive.service.js';
import type { SessionService } from '../services/session.service.js';

// A live process that is not us: the test runner's parent.
const OTHER_LIVE_PID = process.ppid;
const DEAD_PID = 999999;

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'cdm-multi-'));
}

// --- Several servers on one profile -----------------------------------------

test('a free profile is used as is', () => {
  const root = tempDir();
  try {
    const dir = join(root, 'browser-profile-gateway');
    mkdirSync(dir);
    assert.equal(pickProfileDir(dir), dir);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a profile held by another live Chromium falls back to a private one', () => {
  const root = tempDir();
  try {
    const dir = join(root, 'browser-profile-gateway');
    mkdirSync(dir);
    symlinkSync(`${hostname()}-${OTHER_LIVE_PID}`, join(dir, 'SingletonLock'));
    assert.equal(liveProfileLock(dir), `${hostname()}-${OTHER_LIVE_PID}`);
    assert.equal(pickProfileDir(dir, hostname(), 4242), `${dir}-pid4242`);
    assert.ok(liveProfileLock(dir), 'the live lock is left alone');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a stale lock is cleared and the shared profile reused', () => {
  const root = tempDir();
  try {
    const dir = join(root, 'browser-profile-gateway');
    mkdirSync(dir);
    symlinkSync(`${hostname()}-${DEAD_PID}`, join(dir, 'SingletonLock'));
    assert.equal(pickProfileDir(dir), dir);
    assert.equal(liveProfileLock(dir), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('private profiles of dead processes are swept, live ones kept', () => {
  const root = tempDir();
  try {
    const dir = join(root, 'browser-profile-gateway');
    for (const name of [`browser-profile-gateway-pid${DEAD_PID}`, `browser-profile-gateway-pid${OTHER_LIVE_PID}`, 'browser-profile-other']) {
      mkdirSync(join(root, name));
    }
    assert.deepEqual(sweepPrivateProfiles(dir), [`browser-profile-gateway-pid${DEAD_PID}`]);
    assert.ok(existsSync(join(root, `browser-profile-gateway-pid${OTHER_LIVE_PID}`)));
    assert.ok(existsSync(join(root, 'browser-profile-other')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- One keep-alive per data dir --------------------------------------------

test('the first server takes the keep-alive lead, a second one skips', () => {
  const root = tempDir();
  try {
    const file = join(root, 'keepalive.lock');
    assert.equal(claimKeepAliveLead(file, OTHER_LIVE_PID), true);
    assert.equal(claimKeepAliveLead(file, process.pid), false);
    assert.equal(readFileSync(file, 'utf8').trim(), `${hostname()} ${OTHER_LIVE_PID}`);
    assert.equal(claimKeepAliveLead(file, OTHER_LIVE_PID), true, 'the leader keeps it');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the lead of a dead process or another host is taken over', () => {
  const root = tempDir();
  try {
    const file = join(root, 'keepalive.lock');
    writeFileSync(file, `${hostname()} ${DEAD_PID}\n`);
    assert.equal(claimKeepAliveLead(file), true);
    writeFileSync(file, `old-container ${OTHER_LIVE_PID}\n`);
    assert.equal(claimKeepAliveLead(file), true);
    assert.equal(readFileSync(file, 'utf8').trim(), `${hostname()} ${process.pid}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- Dead SSO cookie ----------------------------------------------------------

function fakeSession(generation: { value: number }): SessionService {
  return {
    hasSso: () => true,
    hasSession: () => true,
    jarGeneration: () => generation.value,
  } as unknown as SessionService;
}

test('an expired SSO cookie is not replayed every tick, until new cookies come', async () => {
  resetSsoMemo();
  const generation = { value: 1 };
  const session = fakeSession(generation);
  let refreshes = 0;
  const deps = {
    record: false,
    refresh: async () => {
      refreshes += 1;
      return { ok: false, reason: 'sso-expired' as const };
    },
    probe: async () => ({ outcome: 'ok' as const }),
  };

  const first = await keepAliveTick(session, deps);
  assert.equal(first.outcome, 'ok', 'the storefront probe still runs and decides the outcome');
  await keepAliveTick(session, deps);
  await keepAliveTick(session, deps);
  assert.equal(refreshes, 1);

  generation.value = 2; // import-cookies reloaded the jar
  await keepAliveTick(session, deps);
  assert.equal(refreshes, 2);
  resetSsoMemo();
});

test('a network failure of the SSO refresh is retried next tick', async () => {
  resetSsoMemo();
  const session = fakeSession({ value: 1 });
  let refreshes = 0;
  const deps = {
    record: false,
    refresh: async () => {
      refreshes += 1;
      return { ok: false, reason: 'network' as const };
    },
    probe: async () => ({ outcome: 'ok' as const }),
  };
  await keepAliveTick(session, deps);
  await keepAliveTick(session, deps);
  assert.equal(refreshes, 2);
  resetSsoMemo();
});
