/*
 * File: refreshScheduler.ts
 * Proactive token refresh scheduler.
 *
 * Periodically walks all accounts and refreshes tokens that are about to
 * expire (within AUTH_REFRESH_BEFORE_MS). This keeps the pool warm so
 * requests never pay a refresh latency, and accounts never go dark mid-pool.
 */

import { getAccounts } from './auth.ts';
import { ensureAccountFresh } from './tokenRefresh.ts';
import { logStore } from './logStore.ts';

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let schedulerRunning = false;

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // every 30 minutes

async function refreshSweep(): Promise<void> {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    const accts = getAccounts();
    if (accts.length === 0) return;
    let refreshed = 0;
    for (const acct of accts) {
      if (acct.disabled) continue;
      try {
        const ok = await ensureAccountFresh(acct);
        if (ok && acct.state) refreshed++;
      } catch {
        // per-account failure is non-fatal; next sweep retries
      }
    }
    logStore.log('debug', 'auth', `[refreshScheduler] sweep done — ${refreshed}/${accts.length} accounts fresh`);
  } finally {
    schedulerRunning = false;
  }
}

/** Start the proactive refresh scheduler (idempotent). */
export function startRefreshScheduler(intervalMs: number = CHECK_INTERVAL_MS): void {
  if (schedulerTimer) return;
  // First sweep shortly after boot so the pool starts warm
  setTimeout(() => { void refreshSweep(); }, 15_000);
  schedulerTimer = setInterval(() => { void refreshSweep(); }, intervalMs);
  logStore.log('info', 'auth', `[refreshScheduler] started — interval ${Math.round(intervalMs / 60000)}min`);
}

export function stopRefreshScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}
