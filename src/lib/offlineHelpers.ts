import { supabase } from '@/integrations/supabase/client';
import { cacheData, getCachedData, queueMutation, type CacheTable } from '@/lib/offlineDb';

/**
 * Universal offline-aware query: tries Supabase first, falls back to IndexedDB cache.
 * Automatically caches successful online results.
 */
export async function offlineQuery<T = any>(
  table: CacheTable,
  queryFn?: () => PromiseLike<{ data: T[] | null; error: any }>,
  options?: { cacheResult?: boolean }
): Promise<{ data: T[]; isOffline: boolean }> {
  const isOnline = navigator.onLine;
  const shouldCache = options?.cacheResult !== false;

  if (isOnline) {
    try {
      const result = queryFn
        ? await queryFn()
        : await supabase.from(table as any).select('*');

      if (!result.error && result.data) {
        if (shouldCache) {
          cacheData(table, result.data as any[]).catch(() => {});
        }
        return { data: result.data as T[], isOffline: false };
      }
    } catch {
      // fall through to cache
    }
  }

  const cached = await getCachedData(table);
  return { data: cached as T[], isOffline: true };
}

/**
 * Offline-aware mutation: executes online or queues for later sync.
 * For inserts, returns the inserted row(s). When offline, a client-side UUID
 * is generated so dependent operations can still chain.
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

  // Offline: assign client UUIDs for inserts so callers can chain
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
 * Insert helper that returns a single row (mirrors supabase.insert().select().single()).
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
