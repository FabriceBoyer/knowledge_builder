import PocketBase, { ClientResponseError, type RecordModel } from 'pocketbase'
import type { WorkspaceState } from '../types'

export const POCKETBASE_URL = import.meta.env.VITE_POCKETBASE_URL || 'https://pocketbase.knowledge.ovh'
const AUTH_COLLECTION = 'lexigraph_users'
const COLLECTION = 'lexigraph_workspaces'

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
