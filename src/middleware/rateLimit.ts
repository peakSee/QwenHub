import type { Context } from 'hono';

export interface RateLimitConfig {
  requests_per_minute: number;
  tokens_per_request: number;
  burst_allowance: number;
}

interface BucketState {
  tokens: number;
  lastRefill: number; // timestamp in ms
}

const buckets = new Map<string, BucketState>();

const DEFAULT_CONFIG: RateLimitConfig = {
  requests_per_minute: 60,
  tokens_per_request: 1,
  burst_allowance: 10,
};

export class TokenBucket {
  private key: string;
  private config: RateLimitConfig;
  private maxTokens: number;

  constructor(key: string, config: Partial<RateLimitConfig> = {}) {
    this.key = key;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.maxTokens = this.config.requests_per_minute + this.config.burst_allowance;
  }

  private getBucket(): BucketState {
    const existing = buckets.get(this.key);
    if (existing) return existing;

    const initial: BucketState = {
      tokens: this.maxTokens,
      lastRefill: Date.now(),
    };
    buckets.set(this.key, initial);
    return initial;
  }

  private refill(bucket: BucketState): void {
    const now = Date.now();
    const elapsedMs = now - bucket.lastRefill;
    const elapsedMinutes = elapsedMs / 60000;

    // Add tokens based on elapsed time
    const tokensToAdd = elapsedMinutes * this.config.requests_per_minute;
    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  private calculateRetryAfter(bucket: BucketState): number {
    // Calculate seconds until enough tokens are available for one request
    const tokensNeeded = this.config.tokens_per_request - bucket.tokens;
    if (tokensNeeded <= 0) return 0;

    // Time to accumulate needed tokens: tokens / (requests_per_minute / 60) = seconds
    const tokensPerSecond = this.config.requests_per_minute / 60;
    return Math.max(0.1, tokensNeeded / tokensPerSecond);
  }

  tryConsume(tokens: number = this.config.tokens_per_request): boolean {
    const bucket = this.getBucket();
    this.refill(bucket);

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return true;
    }
    return false;
  }

  getHeaders(): Record<string, string> {
    const bucket = this.getBucket();
    const retryAfter = this.calculateRetryAfter(bucket);

    return {
      'X-RateLimit-Limit': String(this.maxTokens),
      'X-RateLimit-Remaining': String(Math.floor(bucket.tokens)),
      'X-RateLimit-Reset': String(Math.ceil((bucket.lastRefill + 60000) / 1000)),
      ...(retryAfter > 0 ? { 'Retry-After': String(retryAfter) } : {}),
    };
  }
}

// Singleton cache: reuse existing TokenBucket instances per key
const bucketInstances = new Map<string, TokenBucket>();

export async function rateLimitMiddleware(c: Context, key: string, config?: Partial<RateLimitConfig>): Promise<Response | null> {
  // Derive per-client key from IP address to prevent one user starving others
  const forwarded = c.req.header('x-forwarded-for');
  const clientIp = forwarded?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown';
  const clientKey = `${key}:${clientIp}`;
  let bucket = bucketInstances.get(clientKey);
  if (!bucket) {
    bucket = new TokenBucket(clientKey, config);
    bucketInstances.set(clientKey, bucket);
  }
  const consumed = bucket.tryConsume();

  if (!consumed) {
    const headers = bucket.getHeaders();
    return c.json({ error: 'Rate limit exceeded', message: 'Too many requests' }, { status: 429, headers });
  }

  // Attach rate limit headers to response for successful requests
  const headers = bucket.getHeaders();
  c.header('X-RateLimit-Limit', headers['X-RateLimit-Limit']);
  c.header('X-RateLimit-Remaining', headers['X-RateLimit-Remaining']);
  c.header('X-RateLimit-Reset', headers['X-RateLimit-Reset']);

  return null;
}

// Cleanup old buckets periodically (prevents memory growth from stale entries)
export function cleanupIdleBuckets(maxIdleMinutes: number = 60): void {
  const now = Date.now();
  const maxIdleMs = maxIdleMinutes * 60 * 1000;

  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.lastRefill > maxIdleMs) {
      buckets.delete(key);
      bucketInstances.delete(key);
    }
  }
}

// Auto-cleanup: prune idle buckets every 15 minutes to prevent unbounded Map growth.
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    cleanupIdleBuckets(60);
  }, CLEANUP_INTERVAL_MS);
  if (cleanupTimer && typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref(); // Don't prevent process exit
  }
}

export function stopAutoCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
