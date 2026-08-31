// ponytail: simple TTL map, upgrade to persistent cache if process restarts lose tokens
export class TokenCache {
  private cache = new Map<string, { value: string; expiresAt: number }>();

  get(key: string): string | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: string, ttlMs: number): void {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  getOrSet(key: string, factory: () => Promise<string>, ttlMs: number): Promise<string> {
    const existing = this.get(key);
    if (existing) return Promise.resolve(existing);
    return factory().then((value) => {
      this.set(key, value, ttlMs);
      return value;
    });
  }

  /** Number of non-expired entries */
  get size(): number {
    const now = Date.now();
    let count = 0;
    for (const entry of this.cache.values()) {
      if (now < entry.expiresAt) count++;
    }
    return count;
  }
}

export const tokenCache = new TokenCache();
