import PocketBase, { ClientResponseError, type RecordModel } from 'pocketbase'
import type { WorkspaceState } from '../types'

export const POCKETBASE_URL = import.meta.env.VITE_POCKETBASE_URL || 'https://pocketbase.knowledge.ovh'
const CREDENTIALS_KEY = 'lexigraph-pocketbase-guest-v1'
const AUTH_COLLECTION = 'lexigraph_users'
const COLLECTION = 'lexigraph_workspaces'

interface GuestCredentials {
  email: string
  password: string
}

interface WorkspaceRecord extends RecordModel {
  owner: string
  data: WorkspaceState
  clientUpdatedAt: string
  schemaVersion: number
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

function randomSecret() {
  const values = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...values)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)
}

function loadCredentials(): GuestCredentials | null {
  try {
    const value = localStorage.getItem(CREDENTIALS_KEY)
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

function createCredentials(): GuestCredentials {
  const id = crypto.randomUUID()
  const credentials = { email: `lexigraph-${id}@guest.invalid`, password: randomSecret() }
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials))
  return credentials
}

async function authenticate() {
  if (pb.authStore.isValid) {
    try {
      await pb.collection(AUTH_COLLECTION).authRefresh()
      return
    } catch {
      pb.authStore.clear()
    }
  }

  let credentials = loadCredentials()
  if (credentials) {
    try {
      await pb.collection(AUTH_COLLECTION).authWithPassword(credentials.email, credentials.password)
      return
    } catch (error) {
      if (!(error instanceof ClientResponseError) || error.status !== 400) throw error
    }
  }

  credentials = createCredentials()
  await pb.collection(AUTH_COLLECTION).create({
    email: credentials.email,
    password: credentials.password,
    passwordConfirm: credentials.password,
    name: 'Lexigraph guest',
  })
  await pb.collection(AUTH_COLLECTION).authWithPassword(credentials.email, credentials.password)
}

async function getRemoteRecord(): Promise<WorkspaceRecord | null> {
  try {
    const result = await pb.collection(COLLECTION).getList<WorkspaceRecord>(1, 1, { sort: '-updated' })
    const record = result.items[0] ?? null
    workspaceRecordId = record?.id ?? ''
    return record
  } catch (error) {
    if (error instanceof ClientResponseError && error.status === 404) return null
    throw error
  }
}

async function initializeCloudOnce(local: WorkspaceSnapshot): Promise<WorkspaceSnapshot | null> {
  await authenticate()
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
  if (!pb.authStore.isValid) await authenticate()
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
