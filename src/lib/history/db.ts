/** Bağımlılıksız küçük IndexedDB sarmalayıcı (Promise tabanlı). Tarayıcı dışında (test) çağrılmaz. */
const DB_NAME = '3d-pricing'
const DB_VERSION = 1
export const STORE_QUOTES = 'quotes'
export const STORE_CUSTOMERS = 'customers'

let dbPromise: Promise<IDBDatabase> | null = null

export function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined'
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (!hasIndexedDb()) { reject(new Error('IndexedDB yok')); return }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_QUOTES)) {
        const q = db.createObjectStore(STORE_QUOTES, { keyPath: 'id' })
        q.createIndex('date', 'date')
        q.createIndex('customerId', 'customerId')
      }
      if (!db.objectStoreNames.contains(STORE_CUSTOMERS)) {
        const c = db.createObjectStore(STORE_CUSTOMERS, { keyPath: 'id' })
        c.createIndex('name', 'name')
      }
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => { db.close(); dbPromise = null }
      resolve(db)
    }
    req.onerror = () => { dbPromise = null; reject(req.error ?? new Error('IndexedDB açılamadı')) }
    req.onblocked = () => { dbPromise = null; reject(new Error('IndexedDB engellendi')) }
  })
  return dbPromise
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error ?? new Error('IndexedDB isteği başarısız')) })
}

export async function dbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDb()
  return reqToPromise(db.transaction(store, 'readonly').objectStore(store).getAll() as IDBRequest<T[]>)
}
export async function dbGet<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openDb()
  return reqToPromise(db.transaction(store, 'readonly').objectStore(store).get(key) as IDBRequest<T | undefined>)
}
export async function dbPut<T>(store: string, value: T): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).put(value)
  await txDone(tx)
}
export async function dbPutMany<T>(store: string, values: T[]): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store)
  for (const v of values) os.put(v)
  await txDone(tx)
}
export async function dbDelete(store: string, key: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).delete(key)
  await txDone(tx)
}
export async function dbClear(store: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).clear()
  await txDone(tx)
}
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error ?? new Error('İşlem başarısız')); tx.onabort = () => reject(tx.error ?? new Error('İşlem iptal edildi')) })
}
