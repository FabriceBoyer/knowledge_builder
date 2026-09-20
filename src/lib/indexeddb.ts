const DATABASE_NAME = 'lexigraph-cache'
const DATABASE_VERSION = 1
const REPLICA_STORE = 'automerge-replicas'

export interface PendingAutomergeChange {
  changeId: string
  payload: string
}

export interface StoredAutomergeReplica {
  ownerId: string
  document: Uint8Array
  pending: PendingAutomergeChange[]
  updatedAt: string
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(REPLICA_STORE)) request.result.createObjectStore(REPLICA_STORE, { keyPath: 'ownerId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened.'))
  })
}

export async function loadAutomergeReplica(ownerId: string) {
  const database = await openDatabase()
  return new Promise<StoredAutomergeReplica | null>((resolve, reject) => {
    const transaction = database.transaction(REPLICA_STORE, 'readonly')
    const request = transaction.objectStore(REPLICA_STORE).get(ownerId)
    request.onsuccess = () => resolve((request.result as StoredAutomergeReplica | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB replica could not be read.'))
    transaction.oncomplete = () => database.close()
  })
}

export async function saveAutomergeReplica(replica: StoredAutomergeReplica) {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(REPLICA_STORE, 'readwrite')
    transaction.objectStore(REPLICA_STORE).put(replica)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('IndexedDB replica could not be saved.')) }
  })
}

export function indexedDbName() {
  return DATABASE_NAME
}
