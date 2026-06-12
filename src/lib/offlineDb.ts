// Offline data layer — SINGLE SQLite store for the whole app.
//
// This module preserves the exact public API the app already depends on, but
// every read/write now goes through SQLite (OPFS, with in-memory fallback).
// No IndexedDB anywhere. All pages and the sync engine use these helpers.

import { run, all, get } from './sqlite';

// ---------------------------------------------------------------------------
// Schema (created lazily, once)
// ---------------------------------------------------------------------------

let schemaPromise: Promise<void> | null = null;

async function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await run(`CREATE TABLE IF NOT EXISTS cache_rows (
        store TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (store, id)
      )`);
      await run(`CREATE INDEX IF NOT EXISTS idx_cache_store ON cache_rows(store)`);
      await run(`CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        last_sync INTEGER
      )`);
      await run(`CREATE TABLE IF NOT EXISTS query_cache (
        key TEXT PRIMARY KEY,
        data TEXT,
        last_sync INTEGER
      )`);
      await run(`CREATE TABLE IF NOT EXISTS pending_mutations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tbl TEXT NOT NULL,
        operation TEXT NOT NULL,
        data TEXT,
        match_data TEXT,
        timestamp INTEGER NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        next_retry_at INTEGER,
        client_updated_at TEXT
      )`);
      await run(`CREATE INDEX IF NOT EXISTS idx_pm_synced ON pending_mutations(synced)`);
      await run(`CREATE TABLE IF NOT EXISTS failed_sync (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_id INTEGER,
        tbl TEXT NOT NULL,
        operation TEXT NOT NULL,
        data TEXT,
        match_data TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        first_failed_at INTEGER,
        last_failed_at INTEGER,
        last_error TEXT,
        reason TEXT
      )`);
    })().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------

export const MAX_SYNC_ATTEMPTS = 6;
const BACKOFF_BASE_MS = 5_000; // 5s, 10s, 20s, 40s, 80s, 160s
export function backoffDelay(attempts: number): number {
  return BACKOFF_BASE_MS * Math.pow(2, Math.min(attempts, 8));
}

// ---------------------------------------------------------------------------
// Table types
// ---------------------------------------------------------------------------

export type CacheTable =
  | 'categories' | 'customers' | 'inventory' | 'products'
  | 'stock_movements' | 'transaction_items' | 'transactions' | 'warehouses'
  | 'suppliers' | 'employees' | 'employee_attendance' | 'employee_leave'
  | 'employee_loans' | 'employee_loan_payments' | 'employee_payroll'
  | 'expenses' | 'expense_categories' | 'budgets' | 'loans' | 'loan_payments'
  | 'pending_bills' | 'pending_bill_items' | 'profiles' | 'user_roles' | 'system_settings';

export interface PendingMutation {
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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parse<T = any>(s: unknown, fallback: T): T {
  if (typeof s !== 'string') return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function mapMutation(row: any): PendingMutation {
  return {
    id: Number(row.id),
    table: String(row.tbl),
    operation: row.operation,
    data: parse(row.data, null),
    match: parse(row.match_data, undefined),
    timestamp: Number(row.timestamp),
    synced: Number(row.synced) === 1,
    attempts: Number(row.attempts ?? 0),
    last_error: row.last_error ?? null,
    next_retry_at: row.next_retry_at != null ? Number(row.next_retry_at) : undefined,
    client_updated_at: row.client_updated_at ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Table cache (full-table snapshots)
// ---------------------------------------------------------------------------

export async function cacheData(table: CacheTable, data: any[]) {
  await ensureSchema();
  await run('DELETE FROM cache_rows WHERE store = ?', [table]);
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const id = String(item?.id ?? `idx_${i}`);
    await run(
      'INSERT OR REPLACE INTO cache_rows (store, id, data) VALUES (?,?,?)',
      [table, id, JSON.stringify(item)],
    );
  }
  await run(
    'INSERT OR REPLACE INTO sync_meta (key, last_sync) VALUES (?,?)',
    [table, Date.now()],
  );
}

export async function getCachedData(table: CacheTable): Promise<any[]> {
  await ensureSchema();
  const rows = await all('SELECT data FROM cache_rows WHERE store = ?', [table]);
  return rows.map((r) => parse((r as any).data, null)).filter((x) => x != null);
}

// ---------------------------------------------------------------------------
// Mutation queue
// ---------------------------------------------------------------------------

export async function queueMutation(
  table: string,
  operation: 'insert' | 'update' | 'delete' | 'upsert',
  data: any,
  match?: any,
) {
  await ensureSchema();
  const now = Date.now();
  const clientUpdatedAt = new Date(now).toISOString();
  // Stamp client_updated_at on row payloads for last-write-wins conflict resolution.
  let stamped = data;
  if (operation !== 'delete' && data && typeof data === 'object') {
    stamped = Array.isArray(data)
      ? data.map((r) => ({ ...r, client_updated_at: r?.client_updated_at ?? clientUpdatedAt }))
      : { ...data, client_updated_at: data?.client_updated_at ?? clientUpdatedAt };
  }
  await run(
    `INSERT INTO pending_mutations
      (tbl, operation, data, match_data, timestamp, synced, attempts, last_error, next_retry_at, client_updated_at)
     VALUES (?,?,?,?,?,0,0,NULL,?,?)`,
    [
      table,
      operation,
      JSON.stringify(stamped ?? null),
      match !== undefined ? JSON.stringify(match) : null,
      now,
      now,
      clientUpdatedAt,
    ],
  );
}

/** Mutations whose next_retry_at <= now (or unset). Excludes synced. */
export async function getDueMutations(): Promise<PendingMutation[]> {
  await ensureSchema();
  const now = Date.now();
  const rows = await all(
    `SELECT * FROM pending_mutations
     WHERE synced = 0 AND (next_retry_at IS NULL OR next_retry_at <= ?)
     ORDER BY id ASC`,
    [now],
  );
  return rows.map(mapMutation);
}

export async function getPendingMutations(): Promise<PendingMutation[]> {
  await ensureSchema();
  const rows = await all(
    'SELECT * FROM pending_mutations WHERE synced = 0 ORDER BY id ASC',
  );
  return rows.map(mapMutation);
}

export async function markMutationSynced(id: number) {
  await ensureSchema();
  await run('UPDATE pending_mutations SET synced = 1 WHERE id = ?', [id]);
}

/** Record a failed attempt and schedule the next retry with exponential backoff. */
export async function recordSyncFailure(id: number, error: string) {
  await ensureSchema();
  const row = await get('SELECT attempts FROM pending_mutations WHERE id = ?', [id]);
  if (!row) return;
  const attempts = Number((row as any).attempts ?? 0) + 1;
  await run(
    'UPDATE pending_mutations SET attempts = ?, last_error = ?, next_retry_at = ? WHERE id = ?',
    [attempts, error.slice(0, 500), Date.now() + backoffDelay(attempts), id],
  );
}

/** Move a mutation to failed_sync and remove it from the live queue. */
export async function moveToFailedSync(
  id: number,
  reason: 'max_retries' | 'conflict' | 'permanent',
  error: string,
) {
  await ensureSchema();
  const m = await get('SELECT * FROM pending_mutations WHERE id = ?', [id]);
  if (!m) return;
  const row = m as any;
  await run(
    `INSERT INTO failed_sync
      (original_id, tbl, operation, data, match_data, attempts, first_failed_at, last_failed_at, last_error, reason)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      row.id,
      row.tbl,
      row.operation,
      row.data,
      row.match_data,
      Number(row.attempts ?? 0),
      Number(row.timestamp),
      Date.now(),
      error.slice(0, 500),
      reason,
    ],
  );
  await run('DELETE FROM pending_mutations WHERE id = ?', [id]);
}

export async function getFailedSync() {
  await ensureSchema();
  const rows = await all('SELECT * FROM failed_sync ORDER BY id DESC');
  return rows.map((r: any) => ({
    id: Number(r.id),
    original_id: r.original_id != null ? Number(r.original_id) : undefined,
    table: String(r.tbl),
    operation: r.operation,
    data: parse(r.data, null),
    match: parse(r.match_data, undefined),
    attempts: Number(r.attempts ?? 0),
    first_failed_at: Number(r.first_failed_at),
    last_failed_at: Number(r.last_failed_at),
    last_error: r.last_error,
    reason: r.reason,
  }));
}

export async function getFailedSyncCount(): Promise<number> {
  await ensureSchema();
  const row = await get('SELECT COUNT(*) AS c FROM failed_sync');
  return Number((row as any)?.c ?? 0);
}

/** Move a failed entry back into pending_mutations for another try. */
export async function retryFailedSync(failedId: number) {
  await ensureSchema();
  const f = await get('SELECT * FROM failed_sync WHERE id = ?', [failedId]);
  if (!f) return;
  const row = f as any;
  const now = Date.now();
  await run(
    `INSERT INTO pending_mutations
      (tbl, operation, data, match_data, timestamp, synced, attempts, last_error, next_retry_at, client_updated_at)
     VALUES (?,?,?,?,?,0,0,NULL,?,NULL)`,
    [row.tbl, row.operation, row.data, row.match_data, now, now],
  );
  await run('DELETE FROM failed_sync WHERE id = ?', [failedId]);
}

export async function discardFailedSync(failedId: number) {
  await ensureSchema();
  await run('DELETE FROM failed_sync WHERE id = ?', [failedId]);
}

export async function clearSyncedMutations() {
  await ensureSchema();
  await run('DELETE FROM pending_mutations WHERE synced = 1');
}

export async function getLastSyncTime(table: string): Promise<number | null> {
  await ensureSchema();
  const row = await get('SELECT last_sync FROM sync_meta WHERE key = ?', [table]);
  return row ? Number((row as any).last_sync) : null;
}

export async function getPendingCount(): Promise<number> {
  await ensureSchema();
  const row = await get('SELECT COUNT(*) AS c FROM pending_mutations WHERE synced = 0');
  return Number((row as any)?.c ?? 0);
}

// ---------------------------------------------------------------------------
// Keyed query cache (filtered / joined results)
// ---------------------------------------------------------------------------

/** Stable cache key from a base name + filter object. */
export function makeCacheKey(base: string, filters?: Record<string, any>): string {
  if (!filters) return base;
  const norm = Object.keys(filters)
    .sort()
    .filter((k) => filters[k] !== undefined && filters[k] !== null && filters[k] !== '')
    .map((k) => `${k}=${typeof filters[k] === 'object' ? JSON.stringify(filters[k]) : filters[k]}`)
    .join('&');
  return norm ? `${base}?${norm}` : base;
}

export async function getCachedQuery<T = any>(
  key: string,
): Promise<{ data: T; lastSync: number } | null> {
  await ensureSchema();
  const row = await get('SELECT data, last_sync FROM query_cache WHERE key = ?', [key]);
  if (!row) return null;
  return { data: parse((row as any).data, null) as T, lastSync: Number((row as any).last_sync) };
}

export async function setCachedQuery(key: string, data: any) {
  await ensureSchema();
  await run(
    'INSERT OR REPLACE INTO query_cache (key, data, last_sync) VALUES (?,?,?)',
    [key, JSON.stringify(data), Date.now()],
  );
}

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

export function isQueryFresh(
  cached: { lastSync: number } | null | undefined,
  ttlMs: number,
): boolean {
  if (!cached) return false;
  return Date.now() - cached.lastSync < ttlMs;
}

export async function invalidateQuery(key: string) {
  await ensureSchema();
  await run('DELETE FROM query_cache WHERE key = ?', [key]);
}

export async function invalidateQueryByPrefix(prefix: string) {
  await ensureSchema();
  await run('DELETE FROM query_cache WHERE key LIKE ?', [`${prefix}%`]);
}
