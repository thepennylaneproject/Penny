type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
  promise?: Promise<T>;
};

const runtimeCache = new Map<string, CacheEntry<unknown>>();
const runtimeCacheStats = {
  hits: 0,
  misses: 0,
  invalidations: 0,
};

export async function getOrSetRuntimeCache<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const cached = runtimeCache.get(key) as CacheEntry<T> | undefined;
  if (cached) {
    if (cached.value !== undefined && cached.expiresAt > now) {
      runtimeCacheStats.hits += 1;
      return cached.value;
    }
    if (cached.promise) {
      runtimeCacheStats.hits += 1;
      return cached.promise;
    }
  }
  runtimeCacheStats.misses += 1;

  const promise = load()
    .then((value) => {
      runtimeCache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
      return value;
    })
    .catch((error) => {
      runtimeCache.delete(key);
      throw error;
    });

  runtimeCache.set(key, {
    expiresAt: now + ttlMs,
    promise,
  });
  return promise;
}

export function invalidateRuntimeCache(...keys: string[]): void {
  for (const key of keys) {
    if (runtimeCache.delete(key)) {
      runtimeCacheStats.invalidations += 1;
    }
  }
}

export function getRuntimeCacheStats(): {
  entries: number;
  inflight: number;
  hits: number;
  misses: number;
  invalidations: number;
} {
  let inflight = 0;
  for (const entry of runtimeCache.values()) {
    if (entry.promise) inflight += 1;
  }
  return {
    entries: runtimeCache.size,
    inflight,
    hits: runtimeCacheStats.hits,
    misses: runtimeCacheStats.misses,
    invalidations: runtimeCacheStats.invalidations,
  };
}
