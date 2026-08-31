/**
 * wreqCrashLogger — file-only crash logger for HTTP impersonation layer.
 *
 * Originally for wreq-js crashes, now used for the impers worker as well.
 * Writes JSON lines to logs/wreq-crash-*.log.
 * No terminal output (pipe to file, review later).
 * Each line is one event — easy to grep/jq.
 */

import { appendFileSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const LOG_DIR = resolve(process.cwd(), 'logs');
const LOG_FILE = resolve(LOG_DIR, `wreq-crash-${formatDateForFile()}.log`);

let inited = false;

function init(): void {
  if (inited) return;
  mkdirSync(LOG_DIR, { recursive: true });
  inited = true;
}

function formatDateForFile(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}-${String(d.getSeconds()).padStart(2, '0')}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

function runtimeInfo(): Record<string, unknown> {
  return {
    pid: process.pid,
    uptime_s: Math.floor(process.uptime()),
    rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    heap_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  };
}

/** Maximum size per log file before rotating (10MB). */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function write(event: Record<string, unknown>): void {
  if (!inited) init();
  try {
    // Basic rotation check
    try {
      const { statSync } = require('fs');
      const st = statSync(LOG_FILE);
      if (st.size > MAX_FILE_BYTES) {
        writeFileSync(LOG_FILE.replace('.log', '-old.log'), '');
      }
    } catch {
      /* first write or stat failed */
    }
    appendFileSync(LOG_FILE, JSON.stringify(event) + '\n', 'utf-8');
  } catch {
    // Can't write — silently ignore (no terminal spam)
  }
}

/**
 * Log a wreq-js session creation event.
 */
export function logSessionCreate(context: string, opts?: Record<string, unknown>): void {
  write({
    ts: nowISO(),
    kind: 'session.create',
    context,
    opts: opts || {},
    runtime: runtimeInfo(),
  });
}

/**
 * Log a wreq-js session.fetch() call.
 */
export function logFetchCall(context: string, url: string, method: string, status?: number): void {
  write({
    ts: nowISO(),
    kind: 'fetch.call',
    context,
    url: truncateUrl(url),
    method,
    status: status ?? null,
    runtime: runtimeInfo(),
  });
}

/**
 * Log a wreq-js session.close() call.
 */
export function logSessionClose(context: string): void {
  write({
    ts: nowISO(),
    kind: 'session.close',
    context,
    runtime: runtimeInfo(),
  });
}

/**
 * Log a wreq-js error/crash with full details.
 */
export function logCrash(context: string, error: unknown, extra?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : new Error(String(error));
  write({
    ts: nowISO(),
    kind: 'crash',
    context,
    error: {
      message: err.message,
      name: err.name,
      stack: err.stack ?? null,
    },
    extra: extra ?? {},
    runtime: runtimeInfo(),
  });
}

/**
 * Log a general wreq-js lifecycle event (WAF detection, retry, etc).
 */
export function logEvent(context: string, event: string, details?: Record<string, unknown>): void {
  write({
    ts: nowISO(),
    kind: 'event',
    context,
    event,
    details: details ?? {},
    runtime: runtimeInfo(),
  });
}

/**
 * Log the "Bad file descriptor" / epoll tokio crash specifically.
 * This is the known crash pattern with Bun + napi-rs.
 */
export function logTokioCrash(context: string, error: unknown, extra?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : new Error(String(error));
  write({
    ts: nowISO(),
    kind: 'tokio_crash',
    context,
    suspected_cause: 'tokio epoll fd conflict with Bun event loop (napi-rs)',
    error: {
      message: err.message,
      name: err.name,
      stack: err.stack ?? null,
    },
    extra: extra ?? {},
    runtime: runtimeInfo(),
  });
}

/**
 * Get the current log file path (for user reference).
 */
export function getLogPath(): string {
  return LOG_FILE;
}

function truncateUrl(u: string): string {
  return u.length > 150 ? u.slice(0, 150) + '...' : u;
}
