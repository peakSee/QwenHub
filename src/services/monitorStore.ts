/*
 * File: monitorStore.ts
 * Persistent monitoring store — survives restarts by saving to disk.
 * Tracks per-account request results, latencies, modes, errors for long-term
 * quality monitoring on the dashboard Monitor page.
 *
 * Data is stored in .qwen/monitor.json as a bounded rolling buffer.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { projectPath } from '../utils/paths.ts';

// ── Types ──

export interface MonitorEntry {
  id: string;
  timestamp: string;
  accountEmail: string;
  model: string;
  stream: boolean;
  success: boolean;
  latencyMs: number | null;
  error: string | null;
  mode: 'streaming' | 'non-streaming';
}

export interface ModeStats {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  avgLatencyMs: number | null;
}

export interface AccountMetrics {
  email: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  errorRate: number;
  avgLatencyMs: number | null;
  minLatencyMs: number | null;
  maxLatencyMs: number | null;
  medianLatencyMs: number | null;
  p95LatencyMs: number | null;
  byMode: {
    streaming: ModeStats | null;
    nonStreaming: ModeStats | null;
  };
  recentErrors: string[];
  lastActivity: string | null;
}

export interface MonitorSummary {
  accounts: AccountMetrics[];
  totals: {
    totalRequests: number;
    totalSuccess: number;
    totalErrors: number;
    overallErrorRate: number;
    overallAvgLatencyMs: number | null;
    medianLatencyMs: number | null;
    p95LatencyMs: number | null;
  };
  modeComparison: {
    streaming: ModeStats;
    nonStreaming: ModeStats;
  };
  topErrors: Array<{ message: string; count: number }>;
  timeRange: { from: string; to: string } | null;
  totalEntries: number;
}

// ── Helpers ──

function computeLatencyStats(latencies: number[]): {
  avg: number | null;
  min: number | null;
  max: number | null;
  median: number | null;
  p95: number | null;
} {
  if (!latencies.length) return { avg: null, min: null, max: null, median: null, p95: null };
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    avg: Math.round(sum / sorted.length),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
  };
}

function computeModeStats(entries: MonitorEntry[]): ModeStats | null {
  if (!entries.length) return null;
  const errors = entries.filter((e) => !e.success);
  const lats = entries.filter((e) => e.latencyMs != null).map((e) => e.latencyMs as number);
  return {
    totalRequests: entries.length,
    successCount: entries.length - errors.length,
    errorCount: errors.length,
    avgLatencyMs: lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : null,
  };
}

// ── Store ──

const DEFAULT_MAX_ENTRIES = 50000;
const SAVE_DEBOUNCE_MS = 5000;

class MonitorStore {
  private entries: MonitorEntry[] = [];
  private storePath: string;
  private maxEntries: number;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.storePath = projectPath('.qwen', 'monitor.json');
    this.maxEntries = maxEntries;
    this.load();
  }

  /** Record a completed request into the monitor store. */
  record(params: {
    accountEmail: string;
    model: string;
    stream: boolean;
    success: boolean;
    latencyMs: number | null;
    error?: string | null;
  }): void {
    const entry: MonitorEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      timestamp: new Date().toISOString(),
      accountEmail: params.accountEmail,
      model: params.model,
      stream: params.stream,
      success: params.success,
      latencyMs: params.latencyMs,
      error: params.error || null,
      mode: params.stream ? 'streaming' : 'non-streaming',
    };

    this.entries.unshift(entry);

    // Trim to max
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries);
    }

    this.dirty = true;
    this.scheduleSave();
  }

  /** Build aggregated metrics summary from all stored entries. */
  getSummary(): MonitorSummary {
    const all = this.entries;

    // Group by account email
    const byAccount = new Map<string, MonitorEntry[]>();
    for (const entry of all) {
      const email = entry.accountEmail || 'unknown';
      let group = byAccount.get(email);
      if (!group) {
        group = [];
        byAccount.set(email, group);
      }
      group.push(entry);
    }

    // Per-account metrics
    const accounts: AccountMetrics[] = [];
    for (const [email, entries] of byAccount) {
      const errors = entries.filter((e) => !e.success);
      const lats = entries.filter((e) => e.latencyMs != null).map((e) => e.latencyMs as number);
      const latStats = computeLatencyStats(lats);
      const streamingEntries = entries.filter((e) => e.stream);
      const nonStreamingEntries = entries.filter((e) => !e.stream);

      // Collect unique recent errors
      const errSet = new Set<string>();
      for (const e of errors) {
        if (e.error) {
          const truncated = e.error.length > 120 ? e.error.substring(0, 120) + '...' : e.error;
          errSet.add(truncated);
        }
      }

      // Find last activity timestamp
      const sortedByTime = [...entries].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      accounts.push({
        email,
        totalRequests: entries.length,
        successCount: entries.length - errors.length,
        errorCount: errors.length,
        errorRate: entries.length ? Math.round((errors.length / entries.length) * 100) : 0,
        avgLatencyMs: latStats.avg,
        minLatencyMs: latStats.min,
        maxLatencyMs: latStats.max,
        medianLatencyMs: latStats.median,
        p95LatencyMs: latStats.p95,
        byMode: {
          streaming: computeModeStats(streamingEntries),
          nonStreaming: computeModeStats(nonStreamingEntries),
        },
        recentErrors: [...errSet].slice(0, 8),
        lastActivity: sortedByTime[0]?.timestamp || null,
      });
    }

    // Sort accounts by last activity (most recent first)
    accounts.sort((a, b) => {
      if (!a.lastActivity && !b.lastActivity) return 0;
      if (!a.lastActivity) return 1;
      if (!b.lastActivity) return -1;
      return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
    });

    // Totals
    const totalErrors = all.filter((e) => !e.success).length;
    const allLatencies = all.filter((e) => e.latencyMs != null).map((e) => e.latencyMs as number);
    const totalLatStats = computeLatencyStats(allLatencies);

    // Mode comparison
    const streamAll = all.filter((e) => e.stream);
    const nonStreamAll = all.filter((e) => !e.stream);

    const streamModeStats: ModeStats = {
      totalRequests: streamAll.length,
      successCount: streamAll.filter((e) => e.success).length,
      errorCount: streamAll.filter((e) => !e.success).length,
      avgLatencyMs: null,
    };
    const streamLats = streamAll.filter((e) => e.latencyMs != null).map((e) => e.latencyMs as number);
    if (streamLats.length) {
      streamModeStats.avgLatencyMs = Math.round(streamLats.reduce((a, b) => a + b, 0) / streamLats.length);
    }

    const nonStreamModeStats: ModeStats = {
      totalRequests: nonStreamAll.length,
      successCount: nonStreamAll.filter((e) => e.success).length,
      errorCount: nonStreamAll.filter((e) => !e.success).length,
      avgLatencyMs: null,
    };
    const nonStreamLats = nonStreamAll.filter((e) => e.latencyMs != null).map((e) => e.latencyMs as number);
    if (nonStreamLats.length) {
      nonStreamModeStats.avgLatencyMs = Math.round(nonStreamLats.reduce((a, b) => a + b, 0) / nonStreamLats.length);
    }

    // Top errors
    const errorCounts = new Map<string, number>();
    for (const e of all) {
      if (e.error) {
        const normalized = e.error.length > 100 ? e.error.substring(0, 100) + '...' : e.error;
        errorCounts.set(normalized, (errorCounts.get(normalized) || 0) + 1);
      }
    }
    const topErrors = [...errorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([message, count]) => ({ message, count }));

    // Time range
    const sorted = [...all].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const timeRange = sorted.length ? { from: sorted[0].timestamp, to: sorted[sorted.length - 1].timestamp } : null;

    return {
      accounts,
      totals: {
        totalRequests: all.length,
        totalSuccess: all.length - totalErrors,
        totalErrors,
        overallErrorRate: all.length ? Math.round((totalErrors / all.length) * 100) : 0,
        overallAvgLatencyMs: totalLatStats.avg,
        medianLatencyMs: totalLatStats.median,
        p95LatencyMs: totalLatStats.p95,
      },
      modeComparison: {
        streaming: streamModeStats,
        nonStreaming: nonStreamModeStats,
      },
      topErrors,
      timeRange,
      totalEntries: all.length,
    };
  }

  /**
   * Get raw entries from the last N hours (useful for time-boxed queries).
   * Defaults to last 24 hours.
   */
  getRecentEntries(hours = 24): MonitorEntry[] {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return this.entries.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
  }

  /** Count of entries currently stored. */
  get entryCount(): number {
    return this.entries.length;
  }

  // ── Persistence ──

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.dirty) {
        this.save();
        this.dirty = false;
      }
    }, SAVE_DEBOUNCE_MS);
  }

  private load(): void {
    try {
      const dir = projectPath('.qwen');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      if (!existsSync(this.storePath)) {
        writeFileSync(this.storePath, '[]', 'utf-8');
        return;
      }
      const raw = readFileSync(this.storePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.entries = parsed.slice(0, this.maxEntries);
      }
    } catch {
      this.entries = [];
    }
  }

  private save(): void {
    try {
      const dir = projectPath('.qwen');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(this.storePath, JSON.stringify(this.entries), 'utf-8');
    } catch (err: any) {
      console.error('[MonitorStore] Failed to save:', err.message);
    }
  }
}

export const monitorStore = new MonitorStore();
