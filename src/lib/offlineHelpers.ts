import { supabase } from '@/integrations/supabase/client';
import {
  cacheData,
  getCachedData,
  queueMutation,
  getCachedQuery,
  setCachedQuery,
  makeCacheKey,
  isQueryFresh,
  getTtlForKey,
  invalidateQuery,
  invalidateQueryByPrefix,
  type CacheTable,
} from '@/lib/offlineDb';

export { makeCacheKey, invalidateQuery, invalidateQueryByPrefix };

// ─── In-memory mirror of the keyed SQLite cache ───────────────────────────
// Lets a page paint a previously viewed filter SYNCHRONOUSLY (no await on the
// SQLite read), so switching back to a filter you already opened is instant.
const memCache = new Map<string, any>();

/** Synchronously read a previously loaded keyed result (this session). */
export function peekKeyedCache<T = any>(key: string): T | null {
  return (memCache.get(key) as T) ?? null;
}

/** Seed the in-memory mirror from SQLite so later peeks are instant. */
export async function warmKeyedCache(keys: string[]): Promise<void> {
  await Promise.all(
    keys.map(async (key) => {
      if (memCache.has(key)) return;
      try {
        const cached = await getCachedQuery<any>(key);
        if (cached?.data !== undefined && cached?.data !== null) memCache.set(key, cached.data);
      } catch {
        /* ignore */
      }
    })
  );
}

/**
 * Background-load a set of filter variants so they render instantly the first
 * time the user selects them. Runs sequentially to avoid hammering the DB.
 */
export async function prefetchKeyedQueries(
  entries: Array<{ key: string; queryFn: () => PromiseLike<{ data: any; error: any }> }>
): Promise<void> {
  for (const entry of entries) {
    try {
      await offlineKeyedQuery(entry.key, entry.queryFn);
    } catch {
      /* ignore */
    }
  }
}


/**
 * Stale-while-revalidate query for an arbitrary keyed result (filters,
 * date ranges, joins, search terms). Returns cached data instantly when
 * available and refreshes in the background. Use for queries that don't
 * map 1:1 to a full table cache.
 *
 * @param key  Stable cache key (use makeCacheKey).
 * @param queryFn  Network fetcher returning { data, error }.
 * @param onUpdate  Optional callback invoked with fresh data after background refresh.
 */
export async function offlineKeyedQuery<T = any>(
  key: string,
  queryFn: () => PromiseLike<{ data: T | null; error: any }>,
  onUpdate?: (fresh: T) => void,
  options?: { ttlMs?: number; forceRefresh?: boolean }
): Promise<{ data: T | null; isOffline: boolean; fromCache: boolean; isFresh: boolean }> {
  const isOnline = navigator.onLine;
  const cached = await getCachedQuery<T>(key);
  const ttlMs = options?.ttlMs ?? getTtlForKey(key);
  const fresh = !options?.forceRefresh && isQueryFresh(cached, ttlMs);

  const runNetwork = async () => {
    const result = await queryFn();
    if (!result.error && result.data !== null && result.data !== undefined) {
      memCache.set(key, result.data);
      await setCachedQuery(key, result.data);
      return result.data as T;
    }
    return null;
  };

  if (cached) {
    memCache.set(key, cached.data);
    // Skip background refresh entirely while still fresh — saves the round trip.
    if (isOnline && !fresh) {
      runNetwork()
        .then((next) => {
          if (next && onUpdate) {
            try {
              if (JSON.stringify(next) !== JSON.stringify(cached.data)) onUpdate(next);
            } catch {
              onUpdate(next);
            }
          }
        })
        .catch(() => {});
    }
    return { data: cached.data, isOffline: !isOnline, fromCache: true, isFresh: fresh };
  }


  if (isOnline) {
    try {
      const next = await runNetwork();
      if (next !== null) return { data: next, isOffline: false, fromCache: false, isFresh: true };
    } catch {}
  }
  return { data: null, isOffline: true, fromCache: false, isFresh: false };
}


type QueryFn<T> = () => PromiseLike<{ data: T[] | null; error: any }>;

/**
 * Stale-while-revalidate offline-aware query.
 * - Returns cached data IMMEDIATELY if present (no network wait).
 * - Kicks off a background refresh from Supabase to update cache for next call.
 * - Only awaits the network when cache is empty.
 */
export async function offlineQuery<T = any>(
  table: CacheTable,
  queryFn?: QueryFn<T>,
  options?: { cacheResult?: boolean; forceNetwork?: boolean }
): Promise<{ data: T[]; isOffline: boolean }> {
  const isOnline = navigator.onLine;
  const shouldCache = options?.cacheResult !== false;
  const force = options?.forceNetwork === true;

  const runNetwork = async () => {
    const result = queryFn
      ? await queryFn()
      : await supabase.from(table as any).select('*');
    if (!result.error && result.data && shouldCache) {
      cacheData(table, result.data as any[]).catch(() => {});
    }
    return result;
  };

  // Try cache first for instant response
  let cached: any[] = [];
  try {
    cached = await getCachedData(table);
  } catch {
    cached = [];
  }

  if (cached.length > 0 && !force) {
    // Fire-and-forget background refresh
    if (isOnline) {
      runNetwork().catch(() => {});
    }
    return { data: cached as T[], isOffline: !isOnline };
  }

  // No cache (or forced) - need to wait for network
  if (isOnline) {
    try {
      const result = await runNetwork();
      if (!result.error && result.data) {
        return { data: result.data as T[], isOffline: false };
      }
    } catch {
      // fall through
    }
  }

  return { data: cached as T[], isOffline: true };
}

/**
 * Offline-aware mutation: executes online or queues for later sync.
 */
export async function offlineMutate<T = any>(
  table: CacheTable,
  operation: 'insert' | 'update' | 'delete' | 'upsert',
  data: any,
  match?: any
): Promise<{ success: boolean; offline: boolean; data?: T | T[]; error?: any }> {
  if (navigator.onLine) {
    try {
      let result: any;
      const tbl = table as any;

      switch (operation) {
        case 'insert':
          result = await supabase.from(tbl).insert(data).select();
          break;
        case 'update':
          result = await supabase.from(tbl).update(data).match(match).select();
          break;
        case 'delete':
          result = await supabase.from(tbl).delete().match(match);
          break;
        case 'upsert':
          result = await supabase.from(tbl).upsert(data).select();
          break;
      }

      if (result?.error) {
        return { success: false, offline: false, error: result.error };
      }
      return { success: true, offline: false, data: result?.data };
    } catch {
      // queue
    }
  }

  let queuedData = data;
  if (operation === 'insert' || operation === 'upsert') {
    const stamp = (row: any) => ({
      id: row?.id ?? (crypto as any).randomUUID(),
      created_at: row?.created_at ?? new Date().toISOString(),
      ...row,
    });
    queuedData = Array.isArray(data) ? data.map(stamp) : stamp(data);
  }

  await queueMutation(table, operation, queuedData, match);
  return {
    success: true,
    offline: true,
    data: queuedData,
  };
}

/**
 * Insert helper that returns a single row.
 */
export async function offlineInsertSingle<T = any>(
  table: CacheTable,
  row: any
): Promise<{ data: T | null; error: any; offline: boolean }> {
  const result = await offlineMutate<T>(table, 'insert', row);
  if (!result.success) return { data: null, error: result.error, offline: result.offline };
  const out = Array.isArray(result.data) ? result.data[0] : result.data;
  return { data: (out as T) ?? null, error: null, offline: result.offline };
}
