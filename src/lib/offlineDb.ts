import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface OfflineSchema extends DBSchema {
  products: { key: string; value: any; indexes: { 'by-name': string } };
  inventory: { key: string; value: any; indexes: { 'by-product': string; 'by-warehouse': string } };
  categories: { key: string; value: any };
  warehouses: { key: string; value: any };
  customers: { key: string; value: any };
  suppliers: { key: string; value: any };
  transactions: { key: string; value: any; indexes: { 'by-date': string } };
  transaction_items: { key: string; value: any; indexes: { 'by-transaction': string } };
  stock_movements: { key: string; value: any };
  employees: { key: string; value: any };
  employee_attendance: { key: string; value: any };
  employee_leave: { key: string; value: any };
  employee_loans: { key: string; value: any };
  employee_loan_payments: { key: string; value: any };
  employee_payroll: { key: string; value: any };
  expenses: { key: string; value: any };
  expense_categories: { key: string; value: any };
  budgets: { key: string; value: any };
  loans: { key: string; value: any };
  loan_payments: { key: string; value: any };
  pending_bills: { key: string; value: any };
  pending_bill_items: { key: string; value: any };
  profiles: { key: string; value: any };
  user_roles: { key: string; value: any };
  system_settings: { key: string; value: any };
  pending_mutations: {
    key: number;
    value: {
      id?: number;
      table: string;
      operation: 'insert' | 'update' | 'delete' | 'upsert';
      data: any;
      match?: any;
      timestamp: number;
      synced: boolean;
      attempts?: number;
      last_error?: string | null;
      next_retry_at?: number;
      client_updated_at?: string;
    };
    indexes: { 'by-synced': number; 'by-next-retry': number };
  };
  failed_sync: {
    key: number;
    value: {
      id?: number;
      original_id?: number;
      table: string;
      operation: 'insert' | 'update' | 'delete' | 'upsert';
      data: any;
      match?: any;
      attempts: number;
      first_failed_at: number;
      last_failed_at: number;
      last_error: string;
      reason: 'max_retries' | 'conflict' | 'permanent';
    };
  };
  sync_meta: {
    key: string;
    value: { key: string; lastSync: number };
  };
  query_cache: {
    key: string;
    value: { key: string; data: any; lastSync: number };
  };
}

const DB_NAME = 'parts-pal-offline';
const DB_VERSION = 4;

// Retry policy
export const MAX_SYNC_ATTEMPTS = 6;
const BACKOFF_BASE_MS = 5_000; // 5s, 10s, 20s, 40s, 80s, 160s
export function backoffDelay(attempts: number): number {
  return BACKOFF_BASE_MS * Math.pow(2, Math.min(attempts, 8));
}

const SIMPLE_STORES = [
  'suppliers', 'employees', 'employee_attendance', 'employee_leave',
  'employee_loans', 'employee_loan_payments', 'employee_payroll',
  'expenses', 'expense_categories', 'budgets', 'loans', 'loan_payments',
  'pending_bills', 'pending_bill_items', 'profiles', 'user_roles', 'system_settings',
] as const;

let dbInstance: IDBPDatabase<OfflineSchema> | null = null;

export async function getOfflineDb() {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<OfflineSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // V1 stores
      if (oldVersion < 1) {
        const productStore = db.createObjectStore('products', { keyPath: 'id' });
        productStore.createIndex('by-name', 'name');

        const invStore = db.createObjectStore('inventory', { keyPath: 'id' });
        invStore.createIndex('by-product', 'product_id');
        invStore.createIndex('by-warehouse', 'warehouse_id');

        db.createObjectStore('categories', { keyPath: 'id' });
        db.createObjectStore('warehouses', { keyPath: 'id' });
        db.createObjectStore('customers', { keyPath: 'id' });

        const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
        txStore.createIndex('by-date', 'created_at');

        const txItemStore = db.createObjectStore('transaction_items', { keyPath: 'id' });
        txItemStore.createIndex('by-transaction', 'transaction_id');

        db.createObjectStore('stock_movements', { keyPath: 'id' });

        const mutStore = db.createObjectStore('pending_mutations', { keyPath: 'id', autoIncrement: true });
        mutStore.createIndex('by-synced', 'synced');

        db.createObjectStore('sync_meta', { keyPath: 'key' });
      }

      // V2 stores - add all remaining tables
      if (oldVersion < 2) {
        for (const name of SIMPLE_STORES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' });
          }
        }
      }

      // V3 - add query_cache for keyed/filtered query results
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains('query_cache')) {
          db.createObjectStore('query_cache', { keyPath: 'key' });
        }
      }
    },
  });

  return dbInstance;
}

// All cacheable table names
export type CacheTable =
  | 'categories' | 'customers' | 'inventory' | 'products'
  | 'stock_movements' | 'transaction_items' | 'transactions' | 'warehouses'
  | 'suppliers' | 'employees' | 'employee_attendance' | 'employee_leave'
  | 'employee_loans' | 'employee_loan_payments' | 'employee_payroll'
  | 'expenses' | 'expense_categories' | 'budgets' | 'loans' | 'loan_payments'
  | 'pending_bills' | 'pending_bill_items' | 'profiles' | 'user_roles' | 'system_settings';

export async function cacheData(table: CacheTable, data: any[]) {
  const db = await getOfflineDb();
  const tx = db.transaction(table, 'readwrite');
  const store = tx.objectStore(table);
  await store.clear();
  for (const item of data) {
    await store.put(item);
  }
  await tx.done;

  const metaTx = db.transaction('sync_meta', 'readwrite');
  await metaTx.objectStore('sync_meta').put({ key: table as string, lastSync: Date.now() });
  await metaTx.done;
}

export async function getCachedData(table: CacheTable): Promise<any[]> {
  const db = await getOfflineDb();
  return db.getAll(table);
}

export async function queueMutation(
  table: string,
  operation: 'insert' | 'update' | 'delete' | 'upsert',
  data: any,
  match?: any
) {
  const db = await getOfflineDb();
  await db.add('pending_mutations', {
    table, operation, data, match,
    timestamp: Date.now(),
    synced: false,
  } as any);
}

export async function getPendingMutations() {
  const db = await getOfflineDb();
  const all = await db.getAll('pending_mutations');
  return all.filter(m => !m.synced);
}

export async function markMutationSynced(id: number) {
  const db = await getOfflineDb();
  const mutation = await db.get('pending_mutations', id);
  if (mutation) {
    mutation.synced = true;
    await db.put('pending_mutations', mutation);
  }
}

export async function clearSyncedMutations() {
  const db = await getOfflineDb();
  const all = await db.getAll('pending_mutations');
  const tx = db.transaction('pending_mutations', 'readwrite');
  for (const m of all) {
    if (m.synced && m.id) {
      await tx.objectStore('pending_mutations').delete(m.id);
    }
  }
  await tx.done;
}

export async function getLastSyncTime(table: string): Promise<number | null> {
  const db = await getOfflineDb();
  const meta = await db.get('sync_meta', table);
  return meta?.lastSync ?? null;
}

export async function getPendingCount(): Promise<number> {
  const mutations = await getPendingMutations();
  return mutations.length;
}

/**
 * Stable cache key from a base name + filter object.
 * Sorts keys so order doesn't matter.
 */
export function makeCacheKey(base: string, filters?: Record<string, any>): string {
  if (!filters) return base;
  const norm = Object.keys(filters)
    .sort()
    .filter((k) => filters[k] !== undefined && filters[k] !== null && filters[k] !== '')
    .map((k) => `${k}=${typeof filters[k] === 'object' ? JSON.stringify(filters[k]) : filters[k]}`)
    .join('&');
  return norm ? `${base}?${norm}` : base;
}

export async function getCachedQuery<T = any>(key: string): Promise<{ data: T; lastSync: number } | null> {
  const db = await getOfflineDb();
  const row = await db.get('query_cache', key);
  return row ? { data: row.data as T, lastSync: row.lastSync } : null;
}

export async function setCachedQuery(key: string, data: any) {
  const db = await getOfflineDb();
  await db.put('query_cache', { key, data, lastSync: Date.now() });
}

/** Default TTLs (ms) per cache-key base. Falls back to DEFAULT_TTL_MS. */
export const DEFAULT_TTL_MS = 60_000;
export const QUERY_TTL: Record<string, number> = {
  pos_products_with_stock: 30_000,
  pos_loans: 30_000,
  pos_warehouses: 5 * 60_000,
  receipt_settings: 5 * 60_000,
  owner_dashboard: 60_000,
  inventory_list: 30_000,
  reports: 60_000,
};

export function getTtlForKey(key: string): number {
  const base = key.split('?')[0];
  return QUERY_TTL[base] ?? DEFAULT_TTL_MS;
}

/** True if the cached row exists and is within its TTL. */
export function isQueryFresh(
  cached: { lastSync: number } | null | undefined,
  ttlMs: number
): boolean {
  if (!cached) return false;
  return Date.now() - cached.lastSync < ttlMs;
}

/** Invalidate a single keyed cache entry (force next call to refresh). */
export async function invalidateQuery(key: string) {
  const db = await getOfflineDb();
  await db.delete('query_cache', key);
}

/** Invalidate every keyed cache entry whose key starts with `prefix`. */
export async function invalidateQueryByPrefix(prefix: string) {
  const db = await getOfflineDb();
  const tx = db.transaction('query_cache', 'readwrite');
  const store = tx.objectStore('query_cache');
  let cursor = await store.openCursor();
  while (cursor) {
    if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}

