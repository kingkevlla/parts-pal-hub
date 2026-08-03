// SQLite — the SINGLE local store for the whole app (offline-first).
//
// Storage backend:
//   - OPFS (AccessHandlePoolVFS) when the runtime supports synchronous OPFS
//     access handles (Electron desktop + modern browsers). Persistent.
//   - In-memory (MemoryVFS) as a graceful fallback when OPFS is unavailable
//     (some hosted browser previews). The app still runs; data is per-session.
//
// No IndexedDB anywhere. This module is connection-only; the app schema lives
// in offlineDb.ts which calls run()/all()/get().

import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import wasmUrl from 'wa-sqlite/dist/wa-sqlite.wasm?url';
import * as SQLite from 'wa-sqlite';
import { AccessHandlePoolVFS } from 'wa-sqlite/src/examples/AccessHandlePoolVFS.js';
import { MemoryVFS } from 'wa-sqlite/src/examples/MemoryVFS.js';

type SQLiteAPI = ReturnType<typeof SQLite.Factory>;

const DB_NAME = 'pos_inventory.db';
const VFS_DIR = '/pos-inventory-opfs';

let dbHandle: number | null = null;
let api: SQLiteAPI | null = null;
let initPromise: Promise<{ db: number; sqlite3: SQLiteAPI }> | null = null;
let usingMemory = false;

/** True when the runtime supports OPFS sync access handles (persistent storage). */
export function isOpfsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.storage &&
    typeof navigator.storage.getDirectory === 'function' &&
    typeof FileSystemFileHandle !== 'undefined' &&
    'createSyncAccessHandle' in (FileSystemFileHandle.prototype as any)
  );
}

/** True when the active connection is the non-persistent in-memory fallback. */
export function isUsingMemoryFallback(): boolean {
  return usingMemory;
}

async function open(): Promise<{ db: number; sqlite3: SQLiteAPI }> {
  const module = await SQLiteESMFactory({ locateFile: () => wasmUrl });
  const sqlite3 = SQLite.Factory(module);

  let vfsName = 'memory';
  if (isOpfsSupported()) {
    try {
      const vfs = new AccessHandlePoolVFS(VFS_DIR);
      await (vfs as any).isReady;
      (sqlite3.vfs_register as any)(vfs, true);
      vfsName = (vfs as any).name ?? 'AccessHandlePoolVFS';
      usingMemory = false;
    } catch (err) {
      console.warn('[SQLite] OPFS VFS failed, falling back to memory:', err);
      const mem = new MemoryVFS();
      await (mem as any).isReady;
      (sqlite3.vfs_register as any)(mem, true);
      vfsName = (mem as any).name ?? 'memory';
      usingMemory = true;
    }
  } else {
    const mem = new MemoryVFS();
    await (mem as any).isReady;
    (sqlite3.vfs_register as any)(mem, true);
    vfsName = (mem as any).name ?? 'memory';
    usingMemory = true;
  }

  const db = await sqlite3.open_v2(
    DB_NAME,
    SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE,
    vfsName,
  );

  api = sqlite3;
  dbHandle = db;
  return { db, sqlite3 };
}

/** Singleton accessor — opens the DB exactly once. */
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

// wa-sqlite is single-threaded: concurrent statement iteration on the same
// connection corrupts the WASM heap ("memory access out of bounds"). Every
// read/write is serialized through this promise chain.
let queue: Promise<any> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

/** Run statement(s). Pass params only with a SINGLE statement. */
export async function run(sql: string, params: unknown[] = []): Promise<void> {
  return serialize(async () => {
    const { db, sqlite3 } = await getDB();
    for await (const stmt of sqlite3.statements(db, sql)) {
      if (params.length) sqlite3.bind_collection(stmt, params as any);
      await sqlite3.step(stmt);
    }
  });
}

/** Query rows as objects keyed by column name. */
export async function all<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return serialize(async () => {
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
  });
}


/** Single-row helper. */
export async function get<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await all<T>(sql, params);
  return rows[0] ?? null;
}
