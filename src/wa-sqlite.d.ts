declare module 'wa-sqlite/dist/wa-sqlite.mjs' {
  const factory: (config?: { locateFile?: (file: string) => string }) => Promise<any>;
  export default factory;
}

declare module 'wa-sqlite/dist/wa-sqlite-async.mjs' {
  const factory: (config?: { locateFile?: (file: string) => string }) => Promise<any>;
  export default factory;
}

declare module 'wa-sqlite/src/examples/AccessHandlePoolVFS.js' {
  export class AccessHandlePoolVFS {
    constructor(directoryPath: string);
    isReady: Promise<void>;
  }
}

declare module 'wa-sqlite' {
  export function Factory(module: any): any;
  export const SQLITE_OPEN_CREATE: number;
  export const SQLITE_OPEN_READWRITE: number;
  export const SQLITE_ROW: number;
  export const SQLITE_DONE: number;
  const SQLite: any;
  export default SQLite;
}
