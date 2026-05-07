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
    };
    indexes: { 'by-synced': number };
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
const DB_VERSION = 3;

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
