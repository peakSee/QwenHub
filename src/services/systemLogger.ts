import type { RequestLogStore } from './logStore.ts';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};
export interface SystemLogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  metadata?: Record<string, unknown>;
}
export interface SystemLogFilter {
  minLevel?: LogLevel;
  category?: string;
  since?: string;
  limit?: number;
}

const MAX_SYSTEM_ENTRIES = 200;

export class SystemLogger {
  protected systemEntries: SystemLogEntry[] = [];
  protected systemListeners: Set<(entry: SystemLogEntry) => void> = new Set();
  protected systemIdCounter = 0;

  log(level: LogLevel, category: string, message: string, metadata?: Record<string, unknown>): void {
    const entry: SystemLogEntry = {
      id: `sys-${++this.systemIdCounter}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      metadata,
    };
    this.systemEntries.unshift(entry);
    if (this.systemEntries.length > MAX_SYSTEM_ENTRIES) this.systemEntries.pop();
    for (const listener of this.systemListeners) {
      try {
        listener(entry);
      } catch (err) {
        console.error('[SystemLogger] System log listener error:', err);
      }
    }
    // Structured JSON logging to stdout only when piped (Docker, log aggregators).
    // Suppressed in interactive terminals to avoid visual noise.
    if (!process.stdout.isTTY) {
      process.stdout.write(JSON.stringify({ ...entry, logger: 'qwenhub' }) + '\n');
    }
  }
  debug(category: string, message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', category, message, metadata);
  }
  info(category: string, message: string, metadata?: Record<string, unknown>): void {
    this.log('info', category, message, metadata);
  }
  warn(category: string, message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', category, message, metadata);
  }
  error(category: string, message: string, metadata?: Record<string, unknown>): void {
    this.log('error', category, message, metadata);
  }
  getSystemLogs(filter?: SystemLogFilter): SystemLogEntry[] {
    let result = this.systemEntries;
    if (filter?.minLevel) {
      const minRank = LOG_LEVEL_RANK[filter.minLevel];
      result = result.filter((e) => LOG_LEVEL_RANK[e.level] >= minRank);
    }
    if (filter?.category) {
      result = result.filter((e) => e.category === filter.category);
    }
    if (filter?.since) {
      result = result.filter((e) => e.timestamp >= filter.since!);
    }
    return result.slice(0, filter?.limit ?? 100);
  }
  subscribeSystem(listener: (entry: SystemLogEntry) => void): () => void {
    this.systemListeners.add(listener);
    return () => {
      this.systemListeners.delete(listener);
    };
  }
}

// Lazy singleton to avoid circular dependency with logStore.ts
let _logStore: RequestLogStore | null = null;

/** @internal Called once from logStore.ts to register the singleton instance */
export function __registerLogStore(store: RequestLogStore): void {
  _logStore = store;
}

/** Proxy-based lazy singleton — delegates to the real RequestLogStore once registered */
export const logStore: RequestLogStore = new Proxy({} as RequestLogStore, {
  get(_, prop) {
    if (!_logStore) throw new Error('logStore accessed before initialization');
    const store = _logStore as any;
    const v = store[prop];
    return typeof v === 'function' ? v.bind(_logStore) : v;
  },
  set(_, prop, value) {
    if (!_logStore) throw new Error('logStore accessed before initialization');
    const store = _logStore as any;
    store[prop] = value;
    return true;
  },
});
