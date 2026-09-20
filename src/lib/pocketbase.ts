import PocketBase, { ClientResponseError, type RecordModel } from 'pocketbase'
import type { WorkspaceState } from '../types'
import { diffWorkspace, materializeWorkspace, mergeOperation, nextClock, type CrdtEntries, type CrdtOperation } from './crdt'

export const POCKETBASE_URL = import.meta.env.VITE_POCKETBASE_URL || 'https://pocketbase.knowledge.ovh'
const AUTH_COLLECTION = 'lexigraph_users'
const COLLECTION = 'lexigraph_workspaces'
const SYNC_COLLECTION = 'lexigraph_sync_operations'
const REPLICA_KEY = 'lexigraph-crdt-v1'

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

export interface WorkspaceSnapshot {
  data: WorkspaceState
  updatedAt: string
}

export type CloudSyncStatus = 'connecting' | 'synced' | 'saving' | 'offline' | 'error'

const pb = new PocketBase(POCKETBASE_URL)
pb.autoCancellation(false)
let workspaceRecordId = ''
let initialization: Promise<WorkspaceSnapshot | null> | null = null

export interface AuthUser {
  id: string
  email: string
  name: string
  verified: boolean
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
  return { id: record.id, email: String(record.email ?? ''), name: String(record.name ?? ''), verified: true }
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

function replicaStorageKey(ownerId: string) {
  return `${REPLICA_KEY}:${ownerId}`
}

function loadReplica(ownerId: string): ReplicaState {
  try {
    const parsed = JSON.parse(localStorage.getItem(replicaStorageKey(ownerId)) ?? '') as ReplicaState
    if (parsed.version === 1 && parsed.deviceId && parsed.entries && Array.isArray(parsed.pending)) return parsed
  } catch { /* create a fresh replica */ }
  return { version: 1, deviceId: crypto.randomUUID(), counter: 0, latestTimestamp: 0, entries: {}, pending: [] }
}

function saveReplica(ownerId: string, replica: ReplicaState) {
  localStorage.setItem(replicaStorageKey(ownerId), JSON.stringify(replica))
}

function operationFromRecord(record: SyncRecord): CrdtOperation {
  return { opId: record.opId, deviceId: record.deviceId, clock: record.clock, entryKey: record.entryKey, deleted: record.deleted, value: record.value }
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
  const replica = loadReplica(ownerId)
  let stopped = false
  let previousState: WorkspaceState | null = null
  let flushing: Promise<void> | null = null
  let subscribed = false
  let subscriptionAttempt: Promise<void> | null = null
  let ready = false
  let migrationChecked = false
  let latestLocal = local
  let retryDelay = 2000
  let retryTimer: number | undefined
  let syncing: Promise<void> | null = null

  const persist = () => saveReplica(ownerId, replica)
  const makeOperation = (entryKey: string, deleted: boolean, value?: unknown): CrdtOperation => {
    replica.counter += 1
    const clock = nextClock(replica.deviceId, replica.counter, replica.latestTimestamp)
    replica.latestTimestamp = Number(clock.split(':')[0])
    return { opId: crypto.randomUUID(), deviceId: replica.deviceId, clock, entryKey, deleted, value }
  }
  const apply = (operation: CrdtOperation) => {
    replica.latestTimestamp = Math.max(replica.latestTimestamp, Number(operation.clock.split(':')[0]) || 0)
    return mergeOperation(replica.entries, operation)
  }
  const emitMaterialized = () => {
    const state = materializeWorkspace(replica.entries)
    if (!state) return
    previousState = structuredClone(state)
    onRemoteState({ data: state, updatedAt: new Date().toISOString() })
  }
  const hasRemoteOperation = async (opId: string) => {
    try {
      await pb.collection(SYNC_COLLECTION).getFirstListItem(pb.filter('opId = {:opId}', { opId }))
      return true
    } catch { return false }
  }
  const flush = async () => {
    if (flushing) return flushing
    flushing = (async () => {
      while (!stopped && replica.pending.length) {
        const operation = replica.pending[0]
        try {
          await pb.collection(SYNC_COLLECTION).create({ owner: ownerId, ...operation, value: operation.value ?? null })
        } catch (error) {
          if (!(error instanceof ClientResponseError && error.status === 400 && await hasRemoteOperation(operation.opId))) throw error
        }
        replica.pending.shift()
        persist()
      }
      if (!stopped) onStatus('synced')
    })().catch((error) => {
      if (!stopped) onStatus(isConnectivityError(error) || !navigator.onLine ? 'offline' : 'error')
      throw error
    }).finally(() => { flushing = null })
    return flushing
  }
  const pullRemote = async () => {
    const records = await pb.collection(SYNC_COLLECTION).getFullList<SyncRecord>({ sort: 'clock' })
    let changed = false
    records.forEach((record) => { changed = apply(operationFromRecord(record)) || changed })
    persist()
    if (changed) emitMaterialized()
    return records.length
  }
  const publish = (state: WorkspaceState) => {
    if (stopped) return
    latestLocal = { data: state, updatedAt: new Date().toISOString() }
    const operations = diffWorkspace(previousState, state, makeOperation)
    previousState = structuredClone(state)
    if (!operations.length) return
    operations.forEach((operation) => {
      apply(operation)
      replica.pending.push(operation)
    })
    persist()
    onStatus('saving')
    if (ready) void flush().catch((error) => {
      console.warn('PocketBase CRDT flush failed; operations remain queued.', error)
      scheduleRetry()
    })
  }
  const receive = (record: SyncRecord) => {
    if (stopped || !apply(operationFromRecord(record))) return
    persist()
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
    subscriptionAttempt = pb.collection(SYNC_COLLECTION).subscribe<SyncRecord>('*', (event) => {
        if (event.action === 'create' || event.action === 'update') receive(event.record)
      })
      .then(() => { subscribed = true })
      .catch(async (error) => {
        subscribed = false
        try { await pb.collection(SYNC_COLLECTION).unsubscribe('*') } catch { /* retry will rebuild the subscription */ }
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
      const remoteCount = await pullRemote()
      if (!remoteCount && !migrationChecked) {
        migrationChecked = true
        const legacy = await initializeCloud(latestLocal)
        if (legacy) publish(legacy.data)
      }
      await flush()
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

  if (!Object.keys(replica.entries).length) {
    publish(local.data)
  } else {
    previousState = materializeWorkspace(replica.entries)
    emitMaterialized()
  }
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
      if (subscribed) void pb.collection(SYNC_COLLECTION).unsubscribe('*')
    },
  }
}
