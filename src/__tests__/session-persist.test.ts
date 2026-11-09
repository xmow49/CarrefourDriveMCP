import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionService } from '../services/session.service.js';

const dir = mkdtempSync(join(tmpdir(), 'carrefour-persist-test-'));
let n = 0;

beforeEach(() => {
  n += 1;
  process.env.CARREFOUR_SESSION_FILE = join(dir, `cookies-${n}.json`);
  delete process.env.CARREFOUR_COOKIES;
  delete process.env.CARREFOUR_COOKIE_FILE;
});

after(() => rmSync(dir, { recursive: true, force: true }));

/** A jar write in the same millisecond keeps the size and mtime: force a new stamp. */
function touch(offsetMs: number): void {
  const t = new Date(Date.now() + offsetMs);
  utimesSync(process.env.CARREFOUR_SESSION_FILE!, t, t);
}

const FRO = (value: string) => `[{"name":"FRO_SESSID","value":"${value}","domain":"www.carrefour.fr","path":"/"}]`;

test("another server's ordinary write does not make this one drop its browser cookies", () => {
  const live = new SessionService();
  live.importCookies(FRO('live'));
  const before = live.jarGeneration();

  // A second server (or a test run) writes its own, possibly older, copy.
  const other = new SessionService();
  other.importCookies(FRO('stale'));
  touch(5_000);

  assert.equal(live.jarGeneration(), before, 'no reseed of the running browser');
});

test('an explicit import in another process is handed to the running browser', () => {
  const live = new SessionService();
  live.importCookies(FRO('old'));
  const before = live.jarGeneration();

  const cli = new SessionService();
  cli.replaceCookies(FRO('imported'));
  touch(10_000);

  assert.equal(live.jarGeneration(), before + 1);
  assert.match(live.getCookieHeader(), /FRO_SESSID=imported/);
  // Seen once: no new reseed until the next import.
  assert.equal(live.jarGeneration(), before + 1);
});

test('the first import ever (no marker yet when the server started) is noticed too', () => {
  const live = new SessionService();
  live.importCookies(FRO('first'));
  const before = live.jarGeneration(); // marker absent at this point

  new SessionService().replaceCookies(FRO('imported'));
  touch(15_000);
  assert.equal(live.jarGeneration(), before + 1);
});

test('an import in this very process bumps the generation at once', () => {
  const session = new SessionService();
  const before = session.jarGeneration();
  session.replaceCookies(FRO('x'));
  assert.equal(session.jarGeneration(), before + 1);
  session.markImported();
  assert.equal(session.jarGeneration(), before + 2);
});

test('a server that starts after an import does not count it as new', () => {
  new SessionService().replaceCookies(FRO('x'));
  const fresh = new SessionService();
  assert.equal(fresh.jarGeneration(), 0);
});

test('the first import into a fresh data dir writes the marker too', async () => {
  const { existsSync } = await import('node:fs');
  process.env.CARREFOUR_SESSION_FILE = join(dir, 'fresh', 'sessions', 'cookies.json');
  new SessionService().replaceCookies(FRO('x'));
  assert.ok(existsSync(`${process.env.CARREFOUR_SESSION_FILE}.imported`));
});
