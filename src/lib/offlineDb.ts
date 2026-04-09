import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface OfflineSchema extends DBSchema {
  products: {
    key: string;
    value: any;
    indexes: { 'by-name': string };
  };
  inventory: {
    key: string;
    value: any;
    indexes: { 'by-product': string; 'by-warehouse': string };
  };
  categories: {
    key: string;
    value: any;
  };
  warehouses: {
    key: string;
    value: any;
  };
  customers: {
    key: string;
    value: any;
  };
  transactions: {
    key: string;
    value: any;
    indexes: { 'by-date': string };
  };
  transaction_items: {
    key: string;
    value: any;
    indexes: { 'by-transaction': string };
  };
  stock_movements: {
    key: string;
    value: any;
  };
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
    value: { key: string; lastSync: number; };
  };
}

const DB_NAME = 'parts-pal-offline';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<OfflineSchema> | null = null;

export async function getOfflineDb() {
  if (dbInstance) return dbInstance;
  
  dbInstance = await openDB<OfflineSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Products
      const productStore = db.createObjectStore('products', { keyPath: 'id' });
      productStore.createIndex('by-name', 'name');

      // Inventory
      const invStore = db.createObjectStore('inventory', { keyPath: 'id' });
      invStore.createIndex('by-product', 'product_id');
      invStore.createIndex('by-warehouse', 'warehouse_id');

      // Simple stores
      db.createObjectStore('categories', { keyPath: 'id' });
      db.createObjectStore('warehouses', { keyPath: 'id' });
      db.createObjectStore('customers', { keyPath: 'id' });

      // Transactions
      const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
      txStore.createIndex('by-date', 'created_at');

      const txItemStore = db.createObjectStore('transaction_items', { keyPath: 'id' });
      txItemStore.createIndex('by-transaction', 'transaction_id');

      // Stock movements
      db.createObjectStore('stock_movements', { keyPath: 'id' });

      // Pending mutations queue
      const mutStore = db.createObjectStore('pending_mutations', { keyPath: 'id', autoIncrement: true });
      mutStore.createIndex('by-synced', 'synced');

      // Sync metadata
      db.createObjectStore('sync_meta', { keyPath: 'key' });
    },
  });

  return dbInstance;
}

// Cache data locally
type CacheTable = 'categories' | 'customers' | 'inventory' | 'products' | 'stock_movements' | 'transaction_items' | 'transactions' | 'warehouses';

export async function cacheData(table: CacheTable, data: any[]) {
  const db = await getOfflineDb();
  const tx = db.transaction(table, 'readwrite');
  const store = tx.objectStore(table);
  
  // Clear existing and add new
  await store.clear();
  for (const item of data) {
    await store.put(item);
  }
  await tx.done;

  // Update sync timestamp
  const metaTx = db.transaction('sync_meta', 'readwrite');
  await metaTx.objectStore('sync_meta').put({ key: table as string, lastSync: Date.now() });
  await metaTx.done;
}

// Get cached data
export async function getCachedData(table: CacheTable) {
  const db = await getOfflineDb();
  return db.getAll(table);
}

// Queue a mutation for later sync
export async function queueMutation(
  table: string,
  operation: 'insert' | 'update' | 'delete' | 'upsert',
  data: any,
  match?: any
) {
  const db = await getOfflineDb();
  await db.add('pending_mutations', {
    table,
    operation,
    data,
    match,
    timestamp: Date.now(),
    synced: false,
  } as any);
}

// Get pending mutations
export async function getPendingMutations() {
  const db = await getOfflineDb();
  const all = await db.getAll('pending_mutations');
  return all.filter(m => !m.synced);
}

// Mark mutation as synced
export async function markMutationSynced(id: number) {
  const db = await getOfflineDb();
  const mutation = await db.get('pending_mutations', id);
  if (mutation) {
    mutation.synced = true;
    await db.put('pending_mutations', mutation);
  }
}

// Clear synced mutations
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

// Get last sync time for a table
export async function getLastSyncTime(table: string): Promise<number | null> {
  const db = await getOfflineDb();
  const meta = await db.get('sync_meta', table);
  return meta?.lastSync ?? null;
}

// Get pending mutation count
export async function getPendingCount(): Promise<number> {
  const mutations = await getPendingMutations();
  return mutations.length;
}
