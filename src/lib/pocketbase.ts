import PocketBase, { ClientResponseError, type RecordModel } from 'pocketbase'
import type { WorkspaceState } from '../types'
import { materializeWorkspace, mergeOperation, type CrdtEntries, type CrdtOperation } from './crdt'
import { applyDocumentChange, createWorkspaceDocument, documentHeads, lastLocalChange, loadDocument, materializeDocument, mergeDocuments, saveDocument, updateWorkspaceDocument, type WorkspaceDoc } from './automergeWorkspace'
import { shouldCreateCheckpoint } from './compaction'
import { loadAutomergeReplica, saveAutomergeReplica, type PendingAutomergeChange } from './indexeddb'

export const POCKETBASE_URL = import.meta.env.VITE_POCKETBASE_URL || 'https://pocketbase.knowledge.ovh'
const AUTH_COLLECTION = 'lexigraph_users'
const COLLECTION = 'lexigraph_workspaces'
const SYNC_COLLECTION = 'lexigraph_sync_operations'
const REPLICA_KEY = 'lexigraph-crdt-v1'
const AUTOMERGE_CHANGES = 'lexigraph_automerge_changes'
const AUTOMERGE_CHECKPOINTS = 'lexigraph_automerge_checkpoints'

interface WorkspaceRecord extends RecordModel {
  owner: string
  data: WorkspaceState
  clientUpdatedAt: string
  schemaVersion: number
}

interface SyncRecord extends RecordModel, CrdtOperation {
  owner: string
}

interface ReplicaState {
  version: 1
  deviceId: string
  counter: number
  latestTimestamp: number
  entries: CrdtEntries
  pending: CrdtOperation[]
}

interface AutomergeChangeRecord extends RecordModel {
  owner: string
  changeId: string
  payload: string
}

interface AutomergeCheckpointRecord extends RecordModel {
  owner: string
  checkpointId: string
  document: string
  heads: string[]
  changeCount: number
}

export interface WorkspaceSnapshot {
  data: WorkspaceState
  updatedAt: string
}

export type CloudSyncStatus = 'connecting' | 'synced' | 'saving' | 'offline' | 'error' | 'local'

const pb = new PocketBase(POCKETBASE_URL)
pb.autoCancellation(false)
let workspaceRecordId = ''
let initialization: Promise<WorkspaceSnapshot | null> | null = null

export interface AuthUser {
  id: string
  email: string
  name: string
  verified: boolean
  mode: 'cloud' | 'local'
}

function resetSyncState() {
  workspaceRecordId = ''
  initialization = null
}

export function getAuthUser(): AuthUser | null {
  const record = pb.authStore.record
  if (!pb.authStore.isValid || !record) return null
  if (!record.verified) {
    pb.authStore.clear()
    return null
  }
  return { id: record.id, email: String(record.email ?? ''), name: String(record.name ?? ''), verified: true, mode: 'cloud' }
}

export async function restoreAuth() {
  if (!pb.authStore.isValid) return null
  try {
    await pb.collection(AUTH_COLLECTION).authRefresh()
    resetSyncState()
    return getAuthUser()
  } catch {
    pb.authStore.clear()
    return null
  }
}

export async function login(email: string, password: string) {
  await pb.collection(AUTH_COLLECTION).authWithPassword(email.trim().toLowerCase(), password)
  resetSyncState()
  const user = getAuthUser()
  if (!user) throw new Error('Email verification is required.')
  return user
}

export async function register(name: string, email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase()
  await pb.collection(AUTH_COLLECTION).create({
    email: normalizedEmail,
    password,
    passwordConfirm: password,
    name: name.trim(),
  })
  await pb.collection(AUTH_COLLECTION).requestVerification(normalizedEmail)
}

export async function requestEmailVerification(email: string) {
  await pb.collection(AUTH_COLLECTION).requestVerification(email.trim().toLowerCase())
}

export async function confirmEmailVerification(token: string) {
  await pb.collection(AUTH_COLLECTION).confirmVerification(token)
}

export async function requestPasswordReset(email: string) {
  await pb.collection(AUTH_COLLECTION).requestPasswordReset(email.trim().toLowerCase())
}

export async function confirmPasswordReset(token: string, password: string, passwordConfirm: string) {
  await pb.collection(AUTH_COLLECTION).confirmPasswordReset(token, password, passwordConfirm)
}

export async function loginWithGitHub() {
  await pb.collection(AUTH_COLLECTION).authWithOAuth2({ provider: 'github' })
  resetSyncState()
  const user = getAuthUser()
  if (!user) throw new Error('GitHub did not provide a verified email address.')
  return user
}

export async function isGitHubLoginAvailable() {
  try {
    const methods = await pb.collection(AUTH_COLLECTION).listAuthMethods()
    return methods.oauth2.enabled && methods.oauth2.providers.some((provider) => provider.name === 'github')
  } catch {
    return false
  }
}

export function logout() {
  pb.authStore.clear()
  resetSyncState()
}

async function getRemoteRecord(): Promise<WorkspaceRecord | null> {
  try {
    const result = await pb.collection(COLLECTION).getList<WorkspaceRecord>(1, 1)
    const record = result.items[0] ?? null
    workspaceRecordId = record?.id ?? ''
    return record
  } catch (error) {
    if (error instanceof ClientResponseError && error.status === 404) return null
    throw error
  }
}

async function initializeCloudOnce(local: WorkspaceSnapshot): Promise<WorkspaceSnapshot | null> {
  if (!pb.authStore.isValid) throw new Error('Authentication is required before workspace synchronization.')
  const remote = await getRemoteRecord()
  if (!remote) {
    await pushWorkspace(local)
    return null
  }

  const remoteTime = Date.parse(remote.clientUpdatedAt)
  const localTime = Date.parse(local.updatedAt)
  if (Number.isFinite(remoteTime) && remoteTime > localTime) {
    return { data: remote.data, updatedAt: remote.clientUpdatedAt }
  }
  if (localTime > remoteTime) await pushWorkspace(local)
  return null
}

export function initializeCloud(local: WorkspaceSnapshot): Promise<WorkspaceSnapshot | null> {
  initialization ??= initializeCloudOnce(local)
  return initialization
}

export async function pushWorkspace(snapshot: WorkspaceSnapshot) {
  if (!pb.authStore.isValid) throw new Error('Authentication is required before workspace synchronization.')
  const owner = pb.authStore.record?.id
  if (!owner) throw new Error('PocketBase authentication did not return a user.')
  const payload = {
    owner,
    data: snapshot.data,
    clientUpdatedAt: snapshot.updatedAt,
    schemaVersion: 1,
  }
  if (workspaceRecordId) {
    await pb.collection(COLLECTION).update(workspaceRecordId, payload)
  } else {
    const record = await pb.collection(COLLECTION).create<WorkspaceRecord>(payload)
    workspaceRecordId = record.id
  }
}

export function isConnectivityError(error: unknown) {
  return error instanceof ClientResponseError && (error.status === 0 || error.isAbort)
}

function loadLegacyReplica(ownerId: string): ReplicaState | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${REPLICA_KEY}:${ownerId}`) ?? '') as ReplicaState
    if (parsed.version === 1 && parsed.entries) return parsed
  } catch { /* legacy cache is optional */ }
  return null
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function legacyWorkspace(ownerId: string, fallback: WorkspaceSnapshot) {
  const legacy = loadLegacyReplica(ownerId)
  const entries: CrdtEntries = legacy?.entries ? structuredClone(legacy.entries) : {}
  try {
    const records = await pb.collection(SYNC_COLLECTION).getFullList<SyncRecord>({ sort: 'clock' })
    records.forEach((record) => mergeOperation(entries, { opId: record.opId, deviceId: record.deviceId, clock: record.clock, entryKey: record.entryKey, deleted: record.deleted, value: record.value }))
  } catch (error) {
    if (!isConnectivityError(error)) throw error
  }
  const migrated = materializeWorkspace(entries)
  if (migrated) return migrated
  const snapshot = await initializeCloud(fallback)
  return snapshot?.data ?? fallback.data
}

export interface RealtimeSyncOptions {
  ownerId: string
  local: WorkspaceSnapshot
  onRemoteState: (snapshot: WorkspaceSnapshot) => void
  onStatus: (status: CloudSyncStatus) => void
}

export interface WorkspaceSync {
  publish: (state: WorkspaceState) => void
  stop: () => void
}

export async function createWorkspaceSync({ ownerId, local, onRemoteState, onStatus }: RealtimeSyncOptions): Promise<WorkspaceSync> {
  if (!pb.authStore.isValid || pb.authStore.record?.id !== ownerId) throw new Error('Authentication is required before workspace synchronization.')
  const stored = await loadAutomergeReplica(ownerId)
  let workspaceDoc: WorkspaceDoc
  let pending: PendingAutomergeChange[]
  if (stored) {
    workspaceDoc = loadDocument(stored.document)
    pending = stored.pending
  } else {
    workspaceDoc = createWorkspaceDocument(local.data)
    const initialChange = lastLocalChange(workspaceDoc)
    pending = initialChange ? [{ changeId: crypto.randomUUID(), payload: bytesToBase64(initialChange) }] : []
  }
  let stopped = false
  let previousState = materializeDocument(workspaceDoc) ?? local.data
  let flushing: Promise<void> | null = null
  let subscribed = false
  let subscriptionAttempt: Promise<void> | null = null
  let ready = false
  let migrationChecked = false
  let latestLocal = local
  let retryDelay = 2000
  let retryTimer: number | undefined
  let syncing: Promise<void> | null = null
  let persistQueue = Promise.resolve()

  const persist = () => {
    const snapshot = { ownerId, document: saveDocument(workspaceDoc), pending: structuredClone(pending), updatedAt: new Date().toISOString() }
    persistQueue = persistQueue.then(() => saveAutomergeReplica(snapshot)).catch((error) => console.warn('IndexedDB replica save failed.', error))
    return persistQueue
  }
  const emitMaterialized = () => {
    const state = materializeDocument(workspaceDoc)
    if (!state) return
    previousState = structuredClone(state)
    onRemoteState({ data: state, updatedAt: new Date().toISOString() })
  }
  const hasRemoteChange = async (changeId: string) => {
    try {
      await pb.collection(AUTOMERGE_CHANGES).getFirstListItem(pb.filter('changeId = {:changeId}', { changeId }))
      return true
    } catch { return false }
  }
  const flush = async () => {
    if (flushing) return flushing
    flushing = (async () => {
      while (!stopped && pending.length) {
        const change = pending[0]
        try {
          await pb.collection(AUTOMERGE_CHANGES).create({ owner: ownerId, ...change })
        } catch (error) {
          if (!(error instanceof ClientResponseError && error.status === 400 && await hasRemoteChange(change.changeId))) throw error
        }
        pending.shift()
        await persist()
      }
      if (!stopped) onStatus('synced')
    })().catch((error) => {
      if (!stopped) onStatus(isConnectivityError(error) || !navigator.onLine ? 'offline' : 'error')
      throw error
    }).finally(() => { flushing = null })
    return flushing
  }
  const applyChangeRecord = (record: AutomergeChangeRecord) => {
    const before = documentHeads(workspaceDoc).join(',')
    workspaceDoc = applyDocumentChange(workspaceDoc, base64ToBytes(record.payload))
    return before !== documentHeads(workspaceDoc).join(',')
  }
  const applyCheckpointRecord = (record: AutomergeCheckpointRecord) => {
    const before = documentHeads(workspaceDoc).join(',')
    workspaceDoc = mergeDocuments(workspaceDoc, loadDocument(base64ToBytes(record.document)))
    return before !== documentHeads(workspaceDoc).join(',')
  }
  const compact = async (changes: AutomergeChangeRecord[], checkpoints: AutomergeCheckpointRecord[]) => {
    const byteCount = changes.reduce((total, record) => total + record.payload.length, 0)
    if (!shouldCreateCheckpoint(changes.length, byteCount, pending.length)) return
    const checkpointId = crypto.randomUUID()
    await pb.collection(AUTOMERGE_CHECKPOINTS).create({ owner: ownerId, checkpointId, document: bytesToBase64(saveDocument(workspaceDoc)), heads: documentHeads(workspaceDoc), changeCount: changes.length })
    const removals = [...changes.map((record) => [AUTOMERGE_CHANGES, record.id] as const), ...checkpoints.map((record) => [AUTOMERGE_CHECKPOINTS, record.id] as const)]
    for (const [collection, id] of removals) {
      try { await pb.collection(collection).delete(id) } catch (error) { console.warn('Automerge compaction cleanup will be retried later.', error) }
    }
  }
  const pullRemote = async () => {
    const [checkpoints, changes] = await Promise.all([
      pb.collection(AUTOMERGE_CHECKPOINTS).getFullList<AutomergeCheckpointRecord>({ sort: 'checkpointId' }),
      pb.collection(AUTOMERGE_CHANGES).getFullList<AutomergeChangeRecord>({ sort: 'changeId' }),
    ])
    let changed = false
    checkpoints.forEach((record) => { changed = applyCheckpointRecord(record) || changed })
    changes.forEach((record) => { changed = applyChangeRecord(record) || changed })
    await persist()
    if (changed) emitMaterialized()
    return { checkpoints, changes }
  }
  const publish = (state: WorkspaceState) => {
    if (stopped) return
    latestLocal = { data: state, updatedAt: new Date().toISOString() }
    const result = updateWorkspaceDocument(workspaceDoc, previousState, state)
    previousState = structuredClone(state)
    if (!result.change) return
    workspaceDoc = result.document
    pending.push({ changeId: crypto.randomUUID(), payload: bytesToBase64(result.change) })
    void persist()
    onStatus('saving')
    if (ready) void flush().catch((error) => {
      console.warn('PocketBase CRDT flush failed; operations remain queued.', error)
      scheduleRetry()
    })
  }
  const receiveChange = (record: AutomergeChangeRecord) => {
    if (stopped || !applyChangeRecord(record)) return
    void persist()
    emitMaterialized()
  }
  const receiveCheckpoint = (record: AutomergeCheckpointRecord) => {
    if (stopped || !applyCheckpointRecord(record)) return
    void persist()
    emitMaterialized()
  }
  const scheduleRetry = () => {
    if (stopped || retryTimer) return
    retryTimer = window.setTimeout(() => {
      retryTimer = undefined
      synchronize()
    }, retryDelay)
    retryDelay = Math.min(retryDelay * 2, 30000)
  }
  const startSubscription = () => {
    if (stopped || subscribed || subscriptionAttempt) return
    subscriptionAttempt = Promise.all([
      pb.collection(AUTOMERGE_CHANGES).subscribe<AutomergeChangeRecord>('*', (event) => { if (event.action === 'create') receiveChange(event.record) }),
      pb.collection(AUTOMERGE_CHECKPOINTS).subscribe<AutomergeCheckpointRecord>('*', (event) => { if (event.action === 'create') receiveCheckpoint(event.record) }),
    ]).then(() => undefined)
      .then(() => { subscribed = true })
      .catch(async (error) => {
        subscribed = false
        try { await Promise.all([pb.collection(AUTOMERGE_CHANGES).unsubscribe('*'), pb.collection(AUTOMERGE_CHECKPOINTS).unsubscribe('*')]) } catch { /* retry will rebuild subscriptions */ }
        if (!stopped) {
          console.warn('PocketBase realtime unavailable; periodic catch-up remains active.', error)
          scheduleRetry()
        }
      })
      .finally(() => { subscriptionAttempt = null })
  }
  const synchronize = () => {
    if (stopped || syncing) return
    onStatus('connecting')
    startSubscription()
    syncing = (async () => {
      const remote = await pullRemote()
      if (!remote.checkpoints.length && !remote.changes.length && !migrationChecked) {
        migrationChecked = true
        publish(await legacyWorkspace(ownerId, latestLocal))
      }
      await flush()
      await compact(remote.changes, remote.checkpoints)
      retryDelay = 2000
      if (retryTimer) window.clearTimeout(retryTimer)
      retryTimer = undefined
    })().catch((error) => {
      onStatus(isConnectivityError(error) || !navigator.onLine ? 'offline' : 'error')
      console.warn('PocketBase CRDT catch-up failed.', error)
      scheduleRetry()
    }).finally(() => { syncing = null })
  }
  const goOffline = () => { if (!stopped) onStatus('offline') }
  const resume = () => { if (!document.hidden) synchronize() }

  await persist()
  emitMaterialized()
  window.addEventListener('online', synchronize)
  window.addEventListener('offline', goOffline)
  window.addEventListener('focus', synchronize)
  window.addEventListener('pageshow', synchronize)
  document.addEventListener('visibilitychange', resume)
  ready = true
  const catchUpTimer = window.setInterval(() => { if (!document.hidden) synchronize() }, 30000)
  synchronize()

  return {
    publish,
    stop: () => {
      stopped = true
      window.removeEventListener('online', synchronize)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('focus', synchronize)
      window.removeEventListener('pageshow', synchronize)
      document.removeEventListener('visibilitychange', resume)
      if (retryTimer) window.clearTimeout(retryTimer)
      window.clearInterval(catchUpTimer)
      if (subscribed) void Promise.all([pb.collection(AUTOMERGE_CHANGES).unsubscribe('*'), pb.collection(AUTOMERGE_CHECKPOINTS).unsubscribe('*')])
    },
  }
}
