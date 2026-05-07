import { supabase } from '@/integrations/supabase/client';
import { cacheData, getCachedData, queueMutation, type CacheTable } from '@/lib/offlineDb';

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
