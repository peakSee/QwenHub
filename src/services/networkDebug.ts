import crypto from 'node:crypto';

export interface NetworkDebugEntry {
  id: string;
  timestamp: string;
  phase: 'pending' | 'streaming' | 'completed' | 'error';

  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    bodyPreview: string;
    bodySize: number;
  };

  response: {
    status: number | null;
    statusText: string;
    headers: Record<string, string>;
  };

  stream: {
    chunks: string[];
    totalChunks: number;
    firstChunkAt: string | null;
    lastChunkAt: string | null;
  };

  timing: {
    startedAt: number;
    ttfb: number | null;
    totalDuration: number | null;
    chunksPerSecond: number | null;
  };

  category: 'chat' | 'session-create' | 'session-delete' | 'models' | 'settings' | 'auth' | 'other';
  accountEmail: string | null;
  errors: string[];
}

export interface NetworkDebugOptions {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
  category: NetworkDebugEntry['category'];
  accountEmail?: string;
}

const MAX_ENTRIES = 200;
const MAX_STORED_CHUNKS = 100;
const MAX_BODY_PREVIEW = 2000;

const entries: NetworkDebugEntry[] = [];
const entryIndex = new Map<string, NetworkDebugEntry>(); // O(1) lookup by id
const listeners = new Set<(entry: NetworkDebugEntry) => void>();

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();

    if (lowerKey === 'cookie') {
      redacted[key] = value.length > 30 ? `${value.slice(0, 30)}...[redacted]` : value;
    } else if (lowerKey === 'authorization') {
      redacted[key] = 'Bearer ***';
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

function notifyListeners(entry: NetworkDebugEntry): void {
  for (const listener of listeners) {
    try {
      listener(entry);
    } catch (_error) {
      // intentional: listener errors must not break the main flow
      console.error('[NetworkDebug] Listener error:', _error);
    }
  }
}

export function createNetworkEntry(options: NetworkDebugOptions): NetworkDebugEntry {
  const bodyStr = options.body ? JSON.stringify(options.body) : '';
  const entry: NetworkDebugEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    phase: 'pending',
    request: {
      url: options.url,
      method: options.method,
      headers: redactHeaders(options.headers),
      bodyPreview: bodyStr.slice(0, MAX_BODY_PREVIEW),
      bodySize: bodyStr ? new TextEncoder().encode(bodyStr).length : 0,
    },
    response: {
      status: null,
      statusText: '',
      headers: {},
    },
    stream: {
      chunks: [],
      totalChunks: 0,
      firstChunkAt: null,
      lastChunkAt: null,
    },
    timing: {
      startedAt: Date.now(),
      ttfb: null,
      totalDuration: null,
      chunksPerSecond: null,
    },
    category: options.category,
    accountEmail: options.accountEmail ?? null,
    errors: [],
  };

  // Add to front of array (newest first)
  entries.unshift(entry);
  entryIndex.set(entry.id, entry);

  // Maintain FIFO - remove oldest if over limit
  if (entries.length > MAX_ENTRIES) {
    const removed = entries.pop()!;
    entryIndex.delete(removed.id);
  }

  notifyListeners(entry);

  return entry;
}

export function recordResponse(entryId: string, response: Response): void {
  const entry = entryIndex.get(entryId);
  if (!entry) {
    return;
  }

  const now = Date.now();
  entry.response.status = response.status;
  entry.response.statusText = response.statusText;
  entry.timing.ttfb = now - entry.timing.startedAt;

  // Capture response headers
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  entry.response.headers = headers;

  notifyListeners(entry);
}

export function recordStreamChunk(entryId: string, chunk: string): void {
  const entry = entryIndex.get(entryId);
  if (!entry) {
    return;
  }

  const now = new Date().toISOString();

  if (entry.stream.totalChunks === 0) {
    entry.phase = 'streaming';
    entry.stream.firstChunkAt = now;
  }

  // Always increment total count
  entry.stream.totalChunks++;
  entry.stream.lastChunkAt = now;

  // Store up to MAX_STORED_CHUNKS
  if (entry.stream.chunks.length < MAX_STORED_CHUNKS) {
    entry.stream.chunks.push(chunk);
  }

  notifyListeners(entry);
}

export function completeEntry(entryId: string): void {
  const entry = entryIndex.get(entryId);
  if (!entry) {
    return;
  }

  const now = Date.now();
  entry.phase = 'completed';
  entry.timing.totalDuration = now - entry.timing.startedAt;

  // Calculate chunks per second if we have chunks and duration
  if (entry.stream.totalChunks > 0 && entry.timing.totalDuration > 0) {
    entry.timing.chunksPerSecond = entry.stream.totalChunks / (entry.timing.totalDuration / 1000);
  }

  notifyListeners(entry);
}

export function errorEntry(entryId: string, error: string): void {
  const entry = entryIndex.get(entryId);
  if (!entry) {
    return;
  }

  entry.phase = 'error';
  entry.errors.push(error);

  // Calculate duration even on error
  const now = Date.now();
  entry.timing.totalDuration = now - entry.timing.startedAt;

  notifyListeners(entry);
}

export function getRecentNetworkEntries(count: number = 50): NetworkDebugEntry[] {
  return entries.slice(0, Math.min(count, entries.length));
}

export function getNetworkEntry(id: string): NetworkDebugEntry | undefined {
  return entryIndex.get(id);
}

export function subscribeNetwork(listener: (entry: NetworkDebugEntry) => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
