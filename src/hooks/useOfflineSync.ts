import { useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOnlineStatus } from './useOnlineStatus';
import {
  cacheData,
  getCachedData,
  queueMutation,
  getPendingMutations,
  markMutationSynced,
  clearSyncedMutations,
  getPendingCount,
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

export function useOfflineSync() {
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  // Cache all critical data from Supabase
  const cacheAllData = useCallback(async () => {
    if (!isOnline) return;

    try {
      // Batch in groups of 5 to avoid overwhelming the connection
      for (let i = 0; i < CACHE_TABLES.length; i += 5) {
        const batch = CACHE_TABLES.slice(i, i + 5);
        const promises = batch.map(async (table) => {
          try {
            const { data, error } = await supabase.from(table as any).select('*');
            if (!error && data) {
              await cacheData(table, data);
            }
          } catch {
            // Skip individual table errors
          }
        });
        await Promise.all(promises);
      }
      console.log('[Offline] All data cached successfully');
    } catch (err) {
      console.error('[Offline] Cache error:', err);
    }
  }, [isOnline]);

  // Sync pending mutations to Supabase
  const syncPendingMutations = useCallback(async () => {
    if (!isOnline || isSyncing) return;

    const mutations = await getPendingMutations();
    if (mutations.length === 0) return;

    setIsSyncing(true);
    let syncedCount = 0;
    let failedCount = 0;

    for (const mutation of mutations) {
      try {
        let result;
        const table = mutation.table as any;

        switch (mutation.operation) {
          case 'insert':
            result = await supabase.from(table).insert(mutation.data);
            break;
          case 'update':
            result = await supabase.from(table).update(mutation.data).match(mutation.match);
            break;
          case 'delete':
            result = await supabase.from(table).delete().match(mutation.match);
            break;
          case 'upsert':
            result = await supabase.from(table).upsert(mutation.data);
            break;
        }

        if (result?.error) {
          console.error('[Offline] Sync error for mutation:', mutation, result.error);
          failedCount++;
        } else {
          if (mutation.id) await markMutationSynced(mutation.id);
          syncedCount++;
        }
      } catch (err) {
        console.error('[Offline] Sync exception:', err);
        failedCount++;
      }
    }

    await clearSyncedMutations();
    await refreshPendingCount();
    setIsSyncing(false);

    if (syncedCount > 0) {
      toast.success(`Synced ${syncedCount} offline changes`);
      await cacheAllData();
    }
    if (failedCount > 0) {
      toast.error(`${failedCount} changes failed to sync - will retry`);
    }
  }, [isOnline, isSyncing, refreshPendingCount, cacheAllData]);

  // Auto-cache on initial load and periodically when online
  useEffect(() => {
    if (isOnline) {
      cacheAllData();
      syncPendingMutations();

      // Re-cache every 5 minutes
      syncIntervalRef.current = setInterval(() => {
        cacheAllData();
      }, 5 * 60 * 1000);
    }

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [isOnline, cacheAllData, syncPendingMutations]);

  // When coming back online, sync pending mutations
  useEffect(() => {
    if (isOnline) {
      syncPendingMutations();
    }
  }, [isOnline, syncPendingMutations]);

  // Refresh pending count periodically
  useEffect(() => {
    refreshPendingCount();
    const interval = setInterval(refreshPendingCount, 10000);
    return () => clearInterval(interval);
  }, [refreshPendingCount]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    syncNow: syncPendingMutations,
    cacheNow: cacheAllData,
    queueMutation,
    getCachedData,
  };
}
