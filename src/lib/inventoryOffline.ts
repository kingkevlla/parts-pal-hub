// All offline inventory + transaction-queue reads/writes go through SQLite (OPFS).
// No IndexedDB. Schema matches the live Supabase multi-warehouse model.

import { run, all, get } from './sqlite';

export interface OfflineProduct {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category_id: string | null;
  selling_price: number | null;
  cost_price: number | null;
  image_url: string | null;
  unit: string | null;
  updated_at: string | null;
  [key: string]: unknown;
}

export interface OfflineInventory {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  reorder_level: number | null;
  updated_at: string | null;
}

/** Bulk replace/insert products from a Supabase fetch. */
export async function upsertProducts(products: any[]): Promise<void> {
  for (const p of products) {
    await run(
      `INSERT OR REPLACE INTO products
        (id, name, sku, barcode, category_id, selling_price, cost_price, image_url, unit, data, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        p.id,
        p.name ?? '',
        p.sku ?? null,
        p.barcode ?? null,
        p.category_id ?? null,
        p.selling_price ?? null,
        p.cost_price ?? null,
        p.image_url ?? null,
        p.unit ?? null,
        JSON.stringify(p),
        p.updated_at ?? null,
      ],
    );
  }
}

export async function upsertInventory(rows: any[]): Promise<void> {
  for (const r of rows) {
    await run(
      `INSERT OR REPLACE INTO inventory
        (id, product_id, warehouse_id, quantity, reorder_level, updated_at)
       VALUES (?,?,?,?,?,?)`,
      [
        r.id,
        r.product_id,
        r.warehouse_id,
        r.quantity ?? 0,
        r.reorder_level ?? r.min_stock_level ?? 5,
        r.updated_at ?? null,
      ],
    );
  }
}

function rowToProduct(row: Record<string, unknown>): OfflineProduct {
  // Prefer the full JSON snapshot, fall back to columns.
  let base: any = {};
  if (typeof row.data === 'string') {
    try {
      base = JSON.parse(row.data);
    } catch {
      base = {};
    }
  }
  return { ...base, ...row, data: undefined } as OfflineProduct;
}

export async function getAllProducts(): Promise<OfflineProduct[]> {
  const rows = await all('SELECT * FROM products ORDER BY name');
  return rows.map(rowToProduct);
}

export async function searchProducts(query: string): Promise<OfflineProduct[]> {
  const rows = await all(
    `SELECT * FROM products
     WHERE name LIKE ? OR sku = ? OR barcode = ?
     ORDER BY name LIMIT 50`,
    [`%${query}%`, query, query],
  );
  return rows.map(rowToProduct);
}

export async function getProductByBarcode(
  barcode: string,
): Promise<OfflineProduct | null> {
  const row = await get('SELECT * FROM products WHERE barcode = ? LIMIT 1', [
    barcode,
  ]);
  return row ? rowToProduct(row) : null;
}

export async function getInventoryForWarehouse(
  warehouseId: string,
): Promise<OfflineInventory[]> {
  return all<OfflineInventory>(
    'SELECT * FROM inventory WHERE warehouse_id = ?',
    [warehouseId],
  );
}

export async function getLowStockItems(warehouseId?: string) {
  const where = warehouseId
    ? 'WHERE i.warehouse_id = ? AND i.quantity <= i.reorder_level'
    : 'WHERE i.quantity <= i.reorder_level';
  return all(
    `SELECT p.name AS name, i.quantity AS quantity, i.reorder_level AS reorder_level, i.warehouse_id AS warehouse_id
     FROM inventory i JOIN products p ON i.product_id = p.id
     ${where}
     ORDER BY i.quantity ASC`,
    warehouseId ? [warehouseId] : [],
  );
}

/** Queue a transaction so checkout works fully offline. */
export async function queueTransaction(transaction: any): Promise<string> {
  const id = crypto.randomUUID();
  await run(
    `INSERT INTO pending_transactions (id, payload, created_at, synced, attempts)
     VALUES (?,?,?,0,0)`,
    [id, JSON.stringify(transaction), new Date().toISOString()],
  );
  return id;
}

export async function getPendingTransactions(): Promise<
  { id: string; payload: any; attempts: number }[]
> {
  const rows = await all(
    `SELECT id, payload, attempts FROM pending_transactions
     WHERE synced = 0 ORDER BY created_at ASC`,
  );
  return rows.map((r) => ({
    id: String(r.id),
    payload: JSON.parse(String(r.payload)),
    attempts: Number(r.attempts ?? 0),
  }));
}

export async function markTransactionSynced(id: string): Promise<void> {
  await run('UPDATE pending_transactions SET synced = 1 WHERE id = ?', [id]);
}

export async function recordTransactionFailure(
  id: string,
  error: string,
): Promise<void> {
  await run(
    'UPDATE pending_transactions SET attempts = attempts + 1, last_error = ? WHERE id = ?',
    [error.slice(0, 500), id],
  );
}

export async function getPendingTransactionCount(): Promise<number> {
  const row = await get<{ c: number }>(
    'SELECT COUNT(*) AS c FROM pending_transactions WHERE synced = 0',
  );
  return Number(row?.c ?? 0);
}
