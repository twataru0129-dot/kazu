import appConfig from '../../app.config.json';

/**
 * 保存の土台。IndexedDB を主に使い、使えない環境ではメモリに一時保存する
 * （その場合は画面で「保存できない」ことを明示する）。
 * スキーマの変更は onupgradeneeded で「追加」だけを行い、既存データを消さない。
 */
export const DB_VERSION = 1;
export const STORES = ['profiles', 'settings', 'sessions', 'attempts', 'meta'] as const;
export type StoreName = (typeof STORES)[number];

const KEY_PATH: Record<StoreName, string> = {
  profiles: 'id',
  settings: 'profileId',
  sessions: 'id',
  attempts: 'id',
  meta: 'key',
};

export interface TxApi {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  getAll<T>(store: StoreName): Promise<T[]>;
  getAllByIndex<T>(store: StoreName, index: string, key: string): Promise<T[]>;
  put(store: StoreName, value: unknown): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  clear(store: StoreName): Promise<void>;
}

export interface Backend {
  kind: 'indexeddb' | 'memory';
  /** 複数ストアにまたがる操作を1つのトランザクションで行う。途中で失敗したら全部取り消し。 */
  run<T>(stores: readonly StoreName[], mode: 'readonly' | 'readwrite', fn: (tx: TxApi) => Promise<T>): Promise<T>;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function openIndexedDb(name = appConfig.dbName): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name, DB_VERSION);
    open.onupgradeneeded = (ev) => {
      const db = open.result;
      const old = ev.oldVersion;
      // v0 → v1：初期作成。将来の版はここに「追加のみ」の移行を書く。
      if (old < 1) {
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) {
            const os = db.createObjectStore(s, { keyPath: KEY_PATH[s] });
            if (s === 'sessions' || s === 'attempts') os.createIndex('profileId', 'profileId');
            if (s === 'attempts') os.createIndex('sessionId', 'sessionId');
          }
        }
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('blocked'));
  });
}

export function indexedDbBackend(db: IDBDatabase): Backend {
  return {
    kind: 'indexeddb',
    run(stores, mode, fn) {
      return new Promise((resolve, reject) => {
        let tx: IDBTransaction;
        try {
          tx = db.transaction(stores as StoreName[], mode);
        } catch (e) {
          reject(e);
          return;
        }
        let result: unknown;
        let failed: unknown = null;
        const api: TxApi = {
          get: (s, k) => req(tx.objectStore(s).get(k)),
          getAll: (s) => req(tx.objectStore(s).getAll()),
          getAllByIndex: (s, i, k) => req(tx.objectStore(s).index(i).getAll(k)),
          put: (s, v) => req(tx.objectStore(s).put(v)).then(() => undefined),
          delete: (s, k) => req(tx.objectStore(s).delete(k)).then(() => undefined),
          clear: (s) => req(tx.objectStore(s).clear()).then(() => undefined),
        };
        tx.oncomplete = () => (failed ? reject(failed) : resolve(result as never));
        tx.onerror = () => reject(tx.error ?? failed ?? new Error('transaction error'));
        tx.onabort = () => reject(tx.error ?? failed ?? new Error('transaction aborted'));
        fn(api).then(
          (r) => {
            result = r;
          },
          (e) => {
            failed = e;
            try {
              tx.abort();
            } catch {
              /* already finished */
            }
          },
        );
      });
    },
  };
}

/** IndexedDB が使えないときの一時保存（ページを閉じると消える） */
export function memoryBackend(): Backend {
  const data: Record<StoreName, Map<string, unknown>> = Object.fromEntries(STORES.map((s) => [s, new Map()])) as never;
  const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  return {
    kind: 'memory',
    async run(stores, mode, fn) {
      // 失敗時に元に戻せるよう、書き込みはコピーに対して行う
      const work = Object.fromEntries(stores.map((s) => [s, new Map([...data[s]].map(([k, v]) => [k, clone(v)]))])) as Record<StoreName, Map<string, unknown>>;
      const api: TxApi = {
        get: async (s, k) => clone(work[s].get(k)) as never,
        getAll: async (s) => [...work[s].values()].map(clone) as never,
        getAllByIndex: async (s, i, k) => [...work[s].values()].filter((v) => (v as Record<string, unknown>)[i] === k).map(clone) as never,
        put: async (s, v) => {
          if (mode === 'readonly') throw new Error('readonly');
          work[s].set(String((v as Record<string, unknown>)[KEY_PATH[s]]), clone(v));
        },
        delete: async (s, k) => {
          work[s].delete(k);
        },
        clear: async (s) => work[s].clear(),
      };
      const r = await fn(api);
      if (mode === 'readwrite') for (const s of stores) data[s] = work[s];
      return r;
    },
  };
}

export async function createBackend(): Promise<Backend> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no indexedDB');
    const db = await openIndexedDb();
    return indexedDbBackend(db);
  } catch {
    return memoryBackend();
  }
}
