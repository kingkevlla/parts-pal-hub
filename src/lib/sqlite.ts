// SQLite + OPFS local database using wa-sqlite (v1.0.0).
//
// Uses AccessHandlePoolVFS: a synchronous OPFS VFS that works with the
// regular (non-Asyncify) WASM build and does NOT require cross-origin
// isolation (no SharedArrayBuffer / COEP). This is the only local store
// for offline inventory + the transaction queue. No IndexedDB anywhere.

import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
// Let Vite resolve the wasm binary to a served URL.
import wasmUrl from 'wa-sqlite/dist/wa-sqlite.wasm?url';
import * as SQLite from 'wa-sqlite';
import { AccessHandlePoolVFS } from 'wa-sqlite/src/examples/AccessHandlePoolVFS.js';

type SQLiteAPI = ReturnType<typeof SQLite.Factory>;

const DB_NAME = 'pos_inventory.db';
const VFS_DIR = '/pos-inventory-opfs';

let dbHandle: number | null = null;
let api: SQLiteAPI | null = null;
let initPromise: Promise<{ db: number; sqlite3: SQLiteAPI }> | null = null;

/** True when the runtime supports OPFS sync access handles (required by the VFS). */
export function isOpfsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.storage &&
    typeof navigator.storage.getDirectory === 'function' &&
    typeof FileSystemFileHandle !== 'undefined' &&
    // createSyncAccessHandle exists on the prototype in supporting browsers
    'createSyncAccessHandle' in (FileSystemFileHandle.prototype as any)
  );
}

async function open(): Promise<{ db: number; sqlite3: SQLiteAPI }> {
  const module = await SQLiteESMFactory({ locateFile: () => wasmUrl });
  const sqlite3 = SQLite.Factory(module);

  const vfs = new AccessHandlePoolVFS(VFS_DIR);
  // The pool VFS prepares its OPFS directory asynchronously.
  await (vfs as any).isReady;
  // @ts-expect-error vfs_register accepts a VFS instance + makeDefault flag.
  sqlite3.vfs_register(vfs, true);

  const db = await sqlite3.open_v2(
    DB_NAME,
    SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE,
  );

  await initSchema(sqlite3, db);

  api = sqlite3;
  dbHandle = db;
  return { db, sqlite3 };
}

/** Singleton accessor — opens (and migrates) the DB exactly once. */
export async function getDB(): Promise<{ db: number; sqlite3: SQLiteAPI }> {
  if (dbHandle != null && api) return { db: dbHandle, sqlite3: api };
  if (!initPromise) {
    initPromise = open().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

async function initSchema(sqlite3: SQLiteAPI, db: number) {
  // Schema mirrors the live Supabase multi-warehouse model.
  await sqlite3.exec(
    db,
    `
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT,
      barcode TEXT,
      category_id TEXT,
      selling_price REAL,
      cost_price REAL,
      image_url TEXT,
      unit TEXT,
      data TEXT,            -- full JSON row for fields not modeled as columns
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      warehouse_id TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      reorder_level REAL DEFAULT 5,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS pending_transactions (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON inventory(warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_pending_synced ON pending_transactions(synced);
  `,
  );
}

/**
 * Run a statement with optional positional bind params. Returns affected behavior
 * via step; use for INSERT/UPDATE/DELETE/DDL.
 */
export async function run(sql: string, params: unknown[] = []): Promise<void> {
  const { db, sqlite3 } = await getDB();
  for await (const stmt of sqlite3.statements(db, sql)) {
    if (params.length) sqlite3.bind_collection(stmt, params as any);
    await sqlite3.step(stmt);
  }
}

/** Query rows as arrays of objects keyed by column name. */
export async function all<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const { db, sqlite3 } = await getDB();
  const rows: T[] = [];
  for await (const stmt of sqlite3.statements(db, sql)) {
    if (params.length) sqlite3.bind_collection(stmt, params as any);
    const columns = sqlite3.column_names(stmt);
    while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
      const row = sqlite3.row(stmt);
      const obj: Record<string, unknown> = {};
      columns.forEach((c, i) => (obj[c] = row[i]));
      rows.push(obj as T);
    }
  }
  return rows;
}

/** Single-row helper. */
export async function get<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await all<T>(sql, params);
  return rows[0] ?? null;
}
