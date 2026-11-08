import { readFileSync, renameSync, writeFileSync } from 'fs';
import { hostname } from 'os';
import { CARREFOUR_ORIGIN, SessionService, sessionService } from './session.service.js';
import { httpService } from './http.service.js';
import { refreshSession, type RefreshResult } from './auth.service.js';
import { processAlive } from './browser.service.js';
import { dataPath } from '../utils/paths.js';
import { logger } from '../utils/logger.js';

/** Cheap "am I logged in?" probe: the loyalty balance needs an authenticated session. */
export const PROBE_URL = `${CARREFOUR_ORIGIN}/api/user/secured/loyalty/balance`;

export type ProbeOutcome = 'ok' | 'expired' | 'no-session' | 'error';

export interface KeepAliveState {
  /** ISO time of the last probe. */
  lastCheck: string;
  outcome: ProbeOutcome;
  /** ISO time of the last successful probe. */
  lastOk?: string;
  reason?: string;
  intervalMinutes: number;
}

export function stateFile(): string {
  return dataPath('keepalive-state.json');
}

export function readState(file = stateFile()): KeepAliveState | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as KeepAliveState;
  } catch {
    return null;
  }
}

function writeState(state: KeepAliveState, file = stateFile()): void {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, file);
  } catch (error) {
    logger.error('Failed to write the keep-alive state', { error: String(error) });
  }
}

/**
 * 401, or a JSON 403 from the API, means the session is gone. A 403 in HTML is
 * Cloudflare challenging the browser, which says nothing about the session.
 */
export function classifyProbe(status: number, contentType: string | null): { outcome: ProbeOutcome; reason?: string } {
  if (status === 401) return { outcome: 'expired', reason: 'HTTP 401' };
  if (status === 403) {
    return (contentType ?? '').includes('json')
      ? { outcome: 'expired', reason: 'HTTP 403' }
      : { outcome: 'error', reason: 'HTTP 403 without JSON (Cloudflare challenge?)' };
  }
  if (status < 200 || status >= 300) return { outcome: 'error', reason: `HTTP ${status}` };
  return { outcome: 'ok' };
}

/**
 * One authenticated request. httpService already renews the session through
 * the SSO cookie on a 401, so a 401/403 here means it is really gone.
 */
export async function probeSession(
  session: SessionService = sessionService
): Promise<{ outcome: ProbeOutcome; reason?: string }> {
  if (!session.hasSession() && !session.hasSso()) return { outcome: 'no-session' };
  try {
    const result = await httpService.send({
      method: 'GET',
      url: PROBE_URL,
      headers: { accept: 'application/json, text/plain, */*', 'x-requested-with': 'XMLHttpRequest' },
    });
    return classifyProbe(result.status, result.contentType);
  } catch (error) {
    return { outcome: 'error', reason: (error as Error).message.slice(0, 200) };
  }
}

export function keepAliveMinutes(env: NodeJS.ProcessEnv = process.env): number {
  const minutes = parseInt(env.CARREFOUR_KEEPALIVE_MINUTES || '30', 10);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

/**
 * Keep both sessions alive while the server runs:
 *  - the SSO session (moncompte) dies after 60 min idle: replaying the OAuth
 *    chain touches it and refreshes the storefront cookies;
 *  - once the SSO cookie is gone (24 h at most), only real traffic keeps the
 *    storefront session (FRO_*) alive, hence the authenticated probe.
 * Each tick records its outcome in keepalive-state.json, which
 * `check-session` reads to alert without starting a browser.
 */
export interface KeepAliveDeps {
  refresh?: (session: SessionService) => Promise<Pick<RefreshResult, 'ok' | 'reason'>>;
  probe?: (session: SessionService) => Promise<{ outcome: ProbeOutcome; reason?: string }>;
}

/**
 * Jar generation in which the SSO cookie was found expired. Replaying the
 * OAuth chain with a dead SSO cookie can only land on the login page again,
 * so it is not retried — and not logged as an error every tick — until new
 * cookies are imported (which bumps the generation).
 */
let ssoExpiredInGeneration: number | null = null;

export function resetSsoMemo(): void {
  ssoExpiredInGeneration = null;
}

export async function keepAliveTick(
  session: SessionService = sessionService,
  opts: { record?: boolean } & KeepAliveDeps = {}
): Promise<KeepAliveState> {
  const refresh = opts.refresh ?? refreshSession;
  const probeFn = opts.probe ?? probeSession;
  if (session.hasSso() && ssoExpiredInGeneration !== session.jarGeneration()) {
    const refreshed = await refresh(session).catch((error) => ({ ok: false, reason: String(error) }));
    logger.info('Keep-alive: SSO refresh', { ok: refreshed.ok, reason: refreshed.reason });
    if (!refreshed.ok && refreshed.reason === 'sso-expired') {
      ssoExpiredInGeneration = session.jarGeneration();
      logger.warn(
        'Keep-alive: the SSO cookie has expired; the storefront session is now kept alive by the ' +
          'probe alone. The SSO refresh resumes after the next cookie import.'
      );
    }
  }
  const probe = await probeFn(session);
  logger.info('Keep-alive: storefront probe', probe);

  const now = new Date().toISOString();
  const previous = readState();
  const state: KeepAliveState = {
    lastCheck: now,
    outcome: probe.outcome,
    lastOk: probe.outcome === 'ok' ? now : previous?.lastOk,
    reason: probe.reason,
    intervalMinutes: keepAliveMinutes(),
  };
  if (opts.record !== false) writeState(state);
  return state;
}

export function leaderFile(): string {
  return dataPath('keepalive.lock');
}

/**
 * Only one server per data dir runs the keep-alive. Several copies can share
 * it (Hermes starts one per agent session): without this, each of them
 * replayed the SSO chain and overwrote keepalive-state.json, and a copy that
 * could not start its browser recorded an error for a session that was fine.
 * The lead is "<host> <pid>" in keepalive.lock; a dead or foreign holder is
 * taken over, so the lead moves on when its process exits.
 */
export function claimKeepAliveLead(
  file: string = leaderFile(),
  pid: number = process.pid,
  host: string = hostname()
): boolean {
  try {
    const [holderHost, holderPid] = readFileSync(file, 'utf8').trim().split(/\s+/);
    const other = Number(holderPid);
    if (holderHost === host && Number.isInteger(other) && other !== pid && processAlive(other)) return false;
  } catch {
    // no lead yet
  }
  try {
    writeFileSync(file, `${host} ${pid}\n`);
  } catch (error) {
    logger.error('Failed to write the keep-alive lead', { error: String(error) });
  }
  return true;
}

let keepAliveTimer: NodeJS.Timeout | null = null;
let firstTick: NodeJS.Timeout | null = null;

/** Set CARREFOUR_KEEPALIVE_MINUTES=0 to opt out. */
export function startKeepAlive(session: SessionService = sessionService): void {
  const minutes = keepAliveMinutes();
  if (minutes === 0 || keepAliveTimer) return;

  const tick = () => {
    if (!claimKeepAliveLead()) {
      logger.debug('Keep-alive: another server process leads it, skipping this tick');
      return;
    }
    keepAliveTick(session).catch((error) => logger.error('Keep-alive failed', { error: String(error) }));
  };
  // A first probe shortly after start, so the state file is fresh after a restart.
  firstTick = setTimeout(tick, 60_000);
  keepAliveTimer = setInterval(tick, minutes * 60_000);

  // Never hold the process open just for the keep-alive.
  firstTick.unref?.();
  keepAliveTimer.unref?.();
}

export function stopKeepAlive(): void {
  if (firstTick) clearTimeout(firstTick);
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  firstTick = null;
  keepAliveTimer = null;
}
