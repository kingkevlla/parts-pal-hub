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
          // Cache in background - don't block
          cacheData(table, result.data as any[]).catch(() => {});
        }
        return { data: result.data as T[], isOffline: false };
      }
      // On error, fall through to cache
    } catch {
      // Network error, fall through to cache
    }
  }

  // Offline or error: use cache
  const cached = await getCachedData(table);
  return { data: cached as T[], isOffline: true };
}

/**
 * Offline-aware mutation: executes online or queues for later sync.
 * Also updates local cache optimistically.
 */
export async function offlineMutate(
  table: CacheTable,
  operation: 'insert' | 'update' | 'delete' | 'upsert',
  data: any,
  match?: any
): Promise<{ success: boolean; offline: boolean; error?: any }> {
  if (navigator.onLine) {
    try {
      let result;
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
      return { success: true, offline: false };
    } catch {
      // Network failed mid-request, queue it
    }
  }

  // Queue for sync
  await queueMutation(table, operation, data, match);
  return { success: true, offline: true };
}
