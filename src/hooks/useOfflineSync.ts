import { useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOnlineStatus } from './useOnlineStatus';
import {
  cacheData,
  getCachedData,
  queueMutation,
  getDueMutations,
  getPendingMutations,
  markMutationSynced,
  recordSyncFailure,
  moveToFailedSync,
  clearSyncedMutations,
  getPendingCount,
  getFailedSyncCount,
  MAX_SYNC_ATTEMPTS,
  type CacheTable,
} from '@/lib/offlineDb';
import { toast } from 'sonner';

const CACHE_TABLES: CacheTable[] = [
  'products', 'inventory', 'categories', 'warehouses', 'customers',
  'suppliers', 'transactions', 'transaction_items', 'stock_movements',
  'employees', 'employee_attendance', 'employee_leave',
  'employee_loans', 'employee_loan_payments', 'employee_payroll',
  'expenses', 'expense_categories', 'budgets',
  'loans', 'loan_payments',
  'pending_bills', 'pending_bill_items',
  'profiles', 'user_roles', 'system_settings',
];

// Tables that have an `updated_at` column we can use for last-write-wins conflict checks.
const TABLES_WITH_UPDATED_AT = new Set<string>([
  'products', 'inventory', 'pending_bills', 'profiles', 'system_settings',
]);

/** Strip client-only metadata from a row before sending to Supabase. */
function stripClientMeta<T = any>(payload: T): T {
  if (!payload || typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) {
    return payload.map((r) => stripClientMeta(r)) as any;
  }
  const { client_updated_at, ...rest } = payload as any;
  return rest as T;
}

/**
 * Classify a Supabase/Postgres error.
 * - permanent: validation, RLS denial, schema mismatch — never succeeds on retry.
 * - transient: network, 5xx, timeout — retry with backoff.
 */
function classifyError(error: any): 'permanent' | 'transient' {
  if (!error) return 'transient';
  const code = String(error.code ?? '');
  const status = Number(error.status ?? 0);
  const msg = String(error.message ?? '').toLowerCase();

  // Postgres SQLSTATE classes that won't fix themselves: 22 (data exception),
  // 23 (integrity violation), 42 (syntax/access rule), 28 (auth)
  if (/^(22|23|42|28)/.test(code)) return 'permanent';
  // PostgREST permission / RLS / not found
  if (code === 'PGRST301' || code === 'PGRST116' || code === '42501') return 'permanent';
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return 'permanent';
  if (msg.includes('row level security') || msg.includes('violates')) return 'permanent';

  return 'transient';
}

/**
 * Conflict check for update operations on tables with updated_at.
 * Returns true if the server has a newer version than our queued client_updated_at.
 */
async function isStaleUpdate(table: string, match: any, clientUpdatedAt?: string): Promise<boolean> {
  if (!clientUpdatedAt || !match || !TABLES_WITH_UPDATED_AT.has(table)) return false;
  try {
    const { data, error } = await supabase
      .from(table as any)
      .select('updated_at')
      .match(match)
      .maybeSingle();
    if (error || !data) return false;
    const serverTs = new Date((data as any).updated_at).getTime();
    const clientTs = new Date(clientUpdatedAt).getTime();
    return serverTs > clientTs;
  } catch {
    return false;
  }
}

export function useOfflineSync() {
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const cacheIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const syncingRef = useRef(false);

  const refreshCounts = useCallback(async () => {
    const [p, f] = await Promise.all([getPendingCount(), getFailedSyncCount()]);
    setPendingCount(p);
    setFailedCount(f);
  }, []);

  // Cache all critical data from Supabase
  const cacheAllData = useCallback(async () => {
    if (!isOnline) return;
    try {
      for (let i = 0; i < CACHE_TABLES.length; i += 5) {
        const batch = CACHE_TABLES.slice(i, i + 5);
        await Promise.all(
          batch.map(async (table) => {
            try {
              const { data, error } = await supabase.from(table as any).select('*');
              if (!error && data) await cacheData(table, data);
            } catch { /* skip */ }
          })
        );
      }
    } catch (err) {
      console.error('[Offline] Cache error:', err);
    }
  }, [isOnline]);

  // Sync due mutations with retry/backoff + conflict resolution
  const syncPendingMutations = useCallback(async () => {
    if (!isOnline || syncingRef.current) return;
    const mutations = await getDueMutations();
    if (mutations.length === 0) {
      await refreshCounts();
      return;
    }

    syncingRef.current = true;
    setIsSyncing(true);
    let syncedCount = 0;
    let retriedCount = 0;
    let failedPermanently = 0;

    for (const mutation of mutations) {
      const id = mutation.id!;
      const table = mutation.table as any;
      const cleanData = stripClientMeta(mutation.data);

      try {
        // Conflict resolution: skip stale updates (server is newer).
        if (mutation.operation === 'update') {
          const stale = await isStaleUpdate(
            mutation.table,
            mutation.match,
            mutation.client_updated_at,
          );
          if (stale) {
            await moveToFailedSync(id, 'conflict', 'Server row is newer than queued change');
            failedPermanently++;
            continue;
          }
        }

        let result: any;
        switch (mutation.operation) {
          case 'insert':
            result = await supabase.from(table).insert(cleanData);
            break;
          case 'update':
            result = await supabase.from(table).update(cleanData).match(mutation.match);
            break;
          case 'delete':
            result = await supabase.from(table).delete().match(mutation.match);
            break;
          case 'upsert':
            result = await supabase.from(table).upsert(cleanData);
            break;
        }

        if (result?.error) {
          const kind = classifyError(result.error);
          const errMsg = result.error.message ?? String(result.error);
          if (kind === 'permanent') {
            await moveToFailedSync(id, 'permanent', errMsg);
            failedPermanently++;
          } else if ((mutation.attempts ?? 0) + 1 >= MAX_SYNC_ATTEMPTS) {
            await moveToFailedSync(id, 'max_retries', errMsg);
            failedPermanently++;
          } else {
            await recordSyncFailure(id, errMsg);
            retriedCount++;
          }
        } else {
          await markMutationSynced(id);
          syncedCount++;
        }
      } catch (err: any) {
        const errMsg = err?.message ?? String(err);
        // Network exceptions are always transient.
        if ((mutation.attempts ?? 0) + 1 >= MAX_SYNC_ATTEMPTS) {
          await moveToFailedSync(id, 'max_retries', errMsg);
          failedPermanently++;
        } else {
          await recordSyncFailure(id, errMsg);
          retriedCount++;
        }
      }
    }

    await clearSyncedMutations();
    await refreshCounts();
    syncingRef.current = false;
    setIsSyncing(false);

    if (syncedCount > 0) {
      toast.success(`Synced ${syncedCount} offline change${syncedCount > 1 ? 's' : ''}`);
      await cacheAllData();
    }
    if (failedPermanently > 0) {
      toast.error(
        `${failedPermanently} change${failedPermanently > 1 ? 's' : ''} moved to failed sync — review required`,
      );
    }
    if (retriedCount > 0 && syncedCount === 0 && failedPermanently === 0) {
      console.info(`[Offline] ${retriedCount} mutation(s) deferred — will retry with backoff`);
    }
  }, [isOnline, refreshCounts, cacheAllData]);

  // On mount + when online: cache + sync, then run periodic cache refresh and a retry tick.
  useEffect(() => {
    if (!isOnline) return;
    cacheAllData();
    syncPendingMutations();

    cacheIntervalRef.current = setInterval(() => cacheAllData(), 5 * 60 * 1000);
    // Retry tick — picks up due mutations once their backoff window elapses.
    retryIntervalRef.current = setInterval(() => syncPendingMutations(), 15 * 1000);

    return () => {
      if (cacheIntervalRef.current) clearInterval(cacheIntervalRef.current);
      if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
    };
  }, [isOnline, cacheAllData, syncPendingMutations]);

  // Refresh counts periodically so the UI badge stays accurate.
  useEffect(() => {
    refreshCounts();
    const interval = setInterval(refreshCounts, 10000);
    return () => clearInterval(interval);
  }, [refreshCounts]);

  return {
    isOnline,
    pendingCount,
    failedCount,
    isSyncing,
    syncNow: syncPendingMutations,
    cacheNow: cacheAllData,
    queueMutation,
    getCachedData,
    getPendingMutations,
  };
}
