/**
 * Command-line helpers, run as `carrefour-drive-mcp <command>` instead of the server:
 *
 *  - `import-cookies [www.json] [moncompte.json]`: guided import of the
 *    cookies exported from a signed-in browser (Cookie-Editor, DevTools…).
 *    Keeps only the session cookies, backs up the previous jar, writes the new
 *    one and checks it against carrefour.fr. Running servers pick it up on
 *    their next request, no restart needed.
 *  - `check-session [--once] [--probe]`: report the state recorded by the
 *    server's keep-alive, for a cron job that alerts when the session dies.
 *
 * No cookie value is ever printed.
 */
import { copyFileSync, existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { createInterface } from 'readline';
import {
  CARREFOUR_ORIGIN,
  IAM_ORIGIN,
  SSO_COOKIE_NAME,
  cookieExpiry,
  parseCookieInput,
  sessionService,
  type CookieInput,
} from './services/session.service.js';
import { keepAliveTick, readState, type KeepAliveState } from './services/keepalive.service.js';
import { browserService, profileDir } from './services/browser.service.js';
import { dataPath } from './utils/paths.js';

const WWW_HOST = new URL(CARREFOUR_ORIGIN).host;
const IAM_HOST = new URL(IAM_ORIGIN).host;
const IAM_KEEP = new Set([SSO_COOKIE_NAME, 'amlbcookie']);
const REQUIRED = 'FRO_SESSION_ID';
const KEEP_BACKUPS = 5;

// ------------------------------------------------------------- import-cookies

export interface Selection {
  kept: CookieInput[];
  dropped: string[];
  expired: string[];
}

/** Host a cookie belongs to if the server needs it, else null. */
function targetHost(c: CookieInput): string | null {
  const domain = (c.domain ?? '').replace(/^\./, '');
  if (c.name.startsWith('FRO_') && ['', WWW_HOST, 'carrefour.fr'].includes(domain)) return domain || WWW_HOST;
  if (IAM_KEEP.has(c.name) && ['', IAM_HOST, 'carrefour.fr'].includes(domain)) return domain || IAM_HOST;
  return null;
}

/**
 * Keep the storefront session (FRO_* on www) and the SSO session
 * (c4iamsecuretk, amlbcookie on moncompte); drop tracking and expired cookies.
 */
export function selectCookies(batches: CookieInput[][], now = Date.now()): Selection {
  const kept = new Map<string, CookieInput>();
  const dropped: string[] = [];
  const expired: string[] = [];
  for (const batch of batches) {
    for (const c of batch) {
      const host = targetHost(c);
      if (!host) {
        dropped.push(c.name);
        continue;
      }
      const expiry = cookieExpiry(c);
      if (expiry && expiry.getTime() < now) {
        expired.push(c.name);
        continue;
      }
      const cookie = { ...c, domain: c.domain || host, path: c.path || '/' };
      kept.set(`${c.name}|${host}|${cookie.path}`, cookie);
    }
  }
  return { kept: [...kept.values()], dropped: [...new Set(dropped)].sort(), expired };
}

/**
 * Accumulates pasted lines until they form one export: a JSON document
 * (possibly over many lines), a `a=1; b=2` header line, or a file path.
 */
export class PasteBuffer {
  private buf = '';

  /** null: need more lines. 'skip': empty input. 'invalid': start over. */
  push(line: string): CookieInput[] | 'skip' | 'invalid' | null {
    if (!this.buf && !line.trim()) return 'skip';
    this.buf += `${line}\n`;
    const text = this.buf.trim();
    if (!text.startsWith('[') && !text.startsWith('{')) {
      this.buf = '';
      if (!text.includes('=') && existsSync(text)) return parseCookieInput(readFileSync(text, 'utf8'));
      return parseCookieInput(text);
    }
    try {
      JSON.parse(text);
    } catch {
      if (line.trim()) return null;
      this.buf = '';
      return 'invalid';
    }
    this.buf = '';
    return parseCookieInput(text);
  }
}

type LineReader = () => Promise<string | null>;

function stdinLines(): { next: LineReader; close: () => void } {
  const rl = createInterface({ input: process.stdin, terminal: false });
  const queue: string[] = [];
  const waiting: Array<(line: string | null) => void> = [];
  let closed = false;
  rl.on('line', (line) => (waiting.length > 0 ? waiting.shift()!(line) : queue.push(line)));
  rl.on('close', () => {
    closed = true;
    while (waiting.length > 0) waiting.shift()!(null);
  });
  return {
    next: () =>
      queue.length > 0
        ? Promise.resolve(queue.shift()!)
        : closed
          ? Promise.resolve(null)
          : new Promise((res) => waiting.push(res)),
    close: () => rl.close(),
  };
}

async function readPaste(next: LineReader, prompt: string): Promise<CookieInput[] | null> {
  const paste = new PasteBuffer();
  console.log(prompt);
  for (;;) {
    const line = await next();
    if (line === null) throw new Error('input closed');
    const result = paste.push(line);
    if (result === null) continue;
    if (result === 'skip') return null;
    if (result === 'invalid') {
      console.log('  Incomplete or invalid paste, try again.\n');
      console.log(prompt);
      continue;
    }
    return result;
  }
}

async function guided(next: LineReader): Promise<CookieInput[][]> {
  console.log(
    'Carrefour cookie import, 2 steps.\n' +
      'You need a browser signed in to the account and the Cookie-Editor extension (cookie-editor.com).\n' +
      'Never click "Se déconnecter" (log out): it would end the session you are exporting.\n'
  );

  console.log('== Step 1/2: the store site ==');
  console.log(`  1. Open ${CARREFOUR_ORIGIN}/mon-compte and check you are signed in (account page, not a login form).`);
  console.log('  2. Cookie-Editor > Export > JSON (copied to the clipboard).');
  let www: CookieInput[];
  for (;;) {
    const pasted = await readPaste(next, '  3. Paste it here, then press Enter:');
    if (pasted?.some((c) => c.name === REQUIRED)) {
      www = pasted;
      console.log(`  OK: ${pasted.length} cookie(s), including ${REQUIRED}.\n`);
      break;
    }
    console.log(
      pasted === null
        ? '  This step is required.\n'
        : `  No ${REQUIRED} in this paste: check the tab is on ${CARREFOUR_ORIGIN} and signed in, then retry.\n`
    );
  }

  console.log('== Step 2/2: the account site (optional) ==');
  console.log(`  1. Open ${IAM_ORIGIN}/`);
  console.log('     If it asks you to sign in, do not: just press Enter below to skip this step.');
  console.log('  2. Otherwise, Cookie-Editor > Export > JSON.');
  const iam = await readPaste(next, '  3. Paste it here then press Enter (or Enter alone to skip):');
  if (iam === null) {
    console.log('  Skipped.\n');
    return [www];
  }
  console.log(
    iam.some((c) => c.name === SSO_COOKIE_NAME)
      ? `  OK: ${iam.length} cookie(s), including ${SSO_COOKIE_NAME}.\n`
      : `  No ${SSO_COOKIE_NAME} in this paste: the account session is probably closed already. Going on without it.\n`
  );
  return [www, iam];
}

function backupJar(file: string): string | null {
  if (!existsSync(file)) return null;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const backup = `${file}.bak-${stamp}`;
  copyFileSync(file, backup);
  const prefix = `${basename(file)}.bak-`;
  const backups = readdirSync(dirname(file))
    .filter((f) => f.startsWith(prefix))
    .sort();
  for (const old of backups.slice(0, -KEEP_BACKUPS)) unlinkSync(join(dirname(file), old));
  return backup;
}

async function importCookies(args: string[]): Promise<number> {
  const dryRun = args.includes('--dry-run');
  const keepFiles = args.includes('--keep-files');
  const files = args.filter((a) => !a.startsWith('--'));

  let batches: CookieInput[][];
  if (files.length > 0) {
    batches = files.map((f) => parseCookieInput(readFileSync(resolve(f), 'utf8')));
  } else {
    const input = stdinLines();
    try {
      batches = await guided(input.next);
    } finally {
      input.close();
    }
  }

  const { kept, dropped, expired } = selectCookies(batches);
  const names = kept.map((c) => c.name).sort();
  console.log(`Kept (${kept.length}): ${names.join(', ') || 'none'}`);
  console.log(`Ignored (${dropped.length}): ${dropped.join(', ') || 'none'}`);
  if (expired.length > 0) console.log(`Already expired, ignored: ${expired.join(', ')}`);

  if (!names.includes(REQUIRED)) {
    console.log(`\nError: no ${REQUIRED}. Export the cookies from a ${CARREFOUR_ORIGIN} tab signed in to the account.`);
    return 1;
  }
  if (!names.includes(SSO_COOKIE_NAME)) {
    console.log(
      `\nWarning: no ${SSO_COOKIE_NAME} (account sign-in cookie). It works as long as the store session lives, ` +
        'but the server cannot renew it on its own.'
    );
  }
  if (dryRun) {
    console.log('\n--dry-run: nothing written.');
    return 0;
  }

  const file = sessionService.status().sessionFile;
  const backup = backupJar(file);
  sessionService.replaceCookies(JSON.stringify(kept));
  console.log(`\nWritten: ${file}${backup ? ` (previous one saved as ${basename(backup)})` : ''}`);

  console.log('Checking with carrefour.fr...');
  let state: KeepAliveState;
  try {
    state = await keepAliveTick(sessionService, { record: false });
  } finally {
    await browserService.shutdown();
    if (files.length > 0 && !keepFiles) {
      for (const f of files) unlinkSync(resolve(f));
      console.log('Export files deleted (they hold the session).');
    }
  }
  const ok = state.outcome === 'ok';
  console.log(
    ok
      ? '  OK: carrefour.fr accepts the session (loyalty balance read).'
      : `  FAILED: carrefour.fr does not accept the session (${state.outcome}${state.reason ? `, ${state.reason}` : ''}).\n` +
          '  Check the browser is signed in to the account, then export the cookies again.'
  );

  if (ok) console.log('Running servers use the new cookies from their next request, no restart needed.');
  return ok ? 0 : 1;
}

// -------------------------------------------------------------- check-session

export type Verdict = 'ok' | 'expired' | 'error' | 'stale';

export function assess(
  state: KeepAliveState | null,
  now = Date.now(),
  maxAgeMinutes?: number
): { verdict: Verdict; message: string } {
  if (!state) {
    return {
      verdict: 'stale',
      message: 'No keep-alive record yet: is the MCP server running with CARREFOUR_KEEPALIVE_MINUTES > 0?',
    };
  }
  const ageMinutes = Math.round((now - Date.parse(state.lastCheck)) / 60_000);
  const limit = maxAgeMinutes ?? state.intervalMinutes * 3 + 5;
  if (!(ageMinutes <= limit)) {
    return {
      verdict: 'stale',
      message: `Last keep-alive check was ${ageMinutes} min ago: is the MCP server still running?`,
    };
  }
  if (state.outcome === 'ok') return { verdict: 'ok', message: '' };
  if (state.outcome === 'expired' || state.outcome === 'no-session') {
    return {
      verdict: 'expired',
      message:
        `Carrefour session expired${state.lastOk ? ` (last valid ${state.lastOk})` : ''}: ` +
        'import fresh cookies with `carrefour-drive-mcp import-cookies`.',
    };
  }
  return { verdict: 'error', message: `Carrefour session check failed: ${state.reason ?? 'unknown error'}.` };
}

/**
 * One alert per episode: an expiry and a stopped keep-alive are each reported
 * once, whatever came before; a failing check only when nothing was reported.
 */
export function shouldAlert(verdict: Verdict, alerted: string | null): boolean {
  if (verdict === 'ok') return false;
  if (verdict === 'error') return alerted === null;
  return alerted !== verdict;
}

function alertFile(): string {
  return dataPath('keepalive-alert.json');
}

async function checkSession(args: string[]): Promise<number> {
  const once = args.includes('--once');
  const maxAgeArg = args.find((a) => a.startsWith('--max-age-minutes='));
  const maxAge = maxAgeArg ? parseInt(maxAgeArg.split('=')[1], 10) : undefined;

  let state: KeepAliveState | null;
  if (args.includes('--probe')) {
    try {
      state = await keepAliveTick(sessionService, { record: false });
    } finally {
      await browserService.shutdown();
    }
  } else {
    state = readState();
  }

  const { verdict, message } = assess(state, Date.now(), maxAge);
  const code = verdict === 'ok' ? 0 : verdict === 'expired' ? 2 : 1;
  if (!once) {
    console.log(message || 'Carrefour session OK.');
    return code;
  }

  let alerted: string | null = null;
  try {
    alerted = (JSON.parse(readFileSync(alertFile(), 'utf8')) as { alerted: string | null }).alerted;
  } catch {
    // No alert sent yet.
  }
  if (shouldAlert(verdict, alerted)) console.log(message);
  const next = verdict === 'ok' ? null : verdict === 'error' ? (alerted ?? 'error') : verdict;
  writeFileSync(alertFile(), JSON.stringify({ alerted: next, at: new Date().toISOString() }));
  return code;
}

// ------------------------------------------------------------------- dispatch

const COMMANDS: Record<string, (args: string[]) => Promise<number>> = {
  'import-cookies': importCookies,
  'check-session': checkSession,
};

/** Exit code of the CLI command in `argv`, or null when it is not one (start the server). */
export async function runCli(argv: string[]): Promise<number | null> {
  const command = COMMANDS[argv[0]];
  if (!command) return null;
  // Never touch what a running server holds: its Chromium profile (one
  // instance per profile), its shared browser, or cookies from its env.
  process.env.CARREFOUR_BROWSER_PROFILE = `${profileDir()}-cli`;
  delete process.env.CARREFOUR_SHARED_BROWSER;
  delete process.env.CARREFOUR_COOKIES;
  delete process.env.CARREFOUR_COOKIE_FILE;
  return command(argv.slice(1));
}
