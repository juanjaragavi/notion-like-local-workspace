type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  lastAccessedAt: number;
};

class TTLCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    entry.lastAccessedAt = Date.now();
    return entry.value;
  }

  set(key: string, value: T) {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      this.evictLeastRecentlyUsed();
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
      lastAccessedAt: Date.now(),
    });
  }

  delete(key: string) {
    this.store.delete(key);
  }

  has(key: string) {
    return this.get(key) !== undefined;
  }

  private evictLeastRecentlyUsed() {
    let oldestKey: string | null = null;
    let oldestAccess = Number.POSITIVE_INFINITY;

    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= Date.now()) {
        this.store.delete(key);
        continue;
      }

      if (entry.lastAccessedAt < oldestAccess) {
        oldestAccess = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
    }
  }
}

declare global {
  var __notionWorkspaceCaches: Map<string, TTLCache<unknown>> | undefined;
}

const cacheRegistry = globalThis.__notionWorkspaceCaches || new Map();

if (!globalThis.__notionWorkspaceCaches) {
  globalThis.__notionWorkspaceCaches = cacheRegistry;
}

export function getNamedCache<T>(
  name: string,
  ttlMs: number,
  maxEntries: number,
) {
  const existing = cacheRegistry.get(name) as TTLCache<T> | undefined;
  if (existing) {
    return existing;
  }

  const cache = new TTLCache<T>(ttlMs, maxEntries);
  cacheRegistry.set(name, cache as TTLCache<unknown>);
  return cache;
}
