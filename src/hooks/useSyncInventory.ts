// Keeps the local SQLite (OPFS) store in sync with Supabase:
//  - syncDown: pull products + inventory into SQLite when online
//  - syncUp:   flush queued offline transactions to Supabase
//
// Falls back gracefully when OPFS is unavailable (e.g. some hosted browsers).

import { useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isOpfsSupported } from '@/lib/sqlite';
import {
  upsertProducts,
  upsertInventory,
  getPendingTransactions,
  markTransactionSynced,
  recordTransactionFailure,
  getPendingTransactionCount,
} from '@/lib/inventoryOffline';

export function useSyncInventory() {
  const [ready, setReady] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const supported = isOpfsSupported();
  const runningRef = useRef(false);

  const syncDown = useCallback(async () => {
    if (!supported || !navigator.onLine) return;
    const [{ data: products }, { data: inventory }] = await Promise.all([
      supabase.from('products').select('*'),
      supabase.from('inventory').select('*'),
    ]);
    if (products) await upsertProducts(products);
    if (inventory) await upsertInventory(inventory);
    setReady(true);
  }, [supported]);

  const syncUp = useCallback(async () => {
    if (!supported || !navigator.onLine) return;
    const pending = await getPendingTransactions();
    for (const tx of pending) {
      try {
        const { error } = await supabase
          .from('transactions')
          .insert(tx.payload);
        if (error) {
          await recordTransactionFailure(tx.id, error.message);
        } else {
          await markTransactionSynced(tx.id);
        }
      } catch (e: any) {
        await recordTransactionFailure(tx.id, e?.message ?? String(e));
      }
    }
    setPendingCount(await getPendingTransactionCount());
  }, [supported]);

  const syncNow = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      await syncDown();
      await syncUp();
    } catch (err) {
      console.error('[SQLite sync] error', err);
    } finally {
      runningRef.current = false;
    }
  }, [syncDown, syncUp]);

  useEffect(() => {
    if (!supported) return;
    syncNow();
    const onOnline = () => syncNow();
    window.addEventListener('online', onOnline);
    const interval = setInterval(syncNow, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(interval);
    };
  }, [supported, syncNow]);

  return { ready, pendingCount, supported, syncNow };
}
