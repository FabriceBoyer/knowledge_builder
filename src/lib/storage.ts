import type { GraphDocument, WorkspaceState } from '../types'

export const STORAGE_KEY = 'lexigraph-workspace-v1'
export const LOCAL_ONLY_OWNER = 'local-only'

export interface LocalWorkspaceSnapshot {
  data: WorkspaceState
  updatedAt: string
}

function freshGraph(): GraphDocument {
  const now = Date.now()
  return { id: crypto.randomUUID(), name: 'Untitled concept', nodes: [], edges: [], createdAt: now, updatedAt: now }
}

export function initialWorkspace(): WorkspaceState {
  const graph = freshGraph()
  return { senses: [], graphs: [graph], activeGraphId: graph.id }
}

function scopedKey(ownerId: string) {
  return `${STORAGE_KEY}:${ownerId}`
}

export function loadWorkspaceSnapshot(ownerId: string): LocalWorkspaceSnapshot {
  try {
    let value = localStorage.getItem(scopedKey(ownerId))
    if (!value) {
      value = localStorage.getItem(STORAGE_KEY)
      if (value) {
        localStorage.setItem(scopedKey(ownerId), value)
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    if (!value) return { data: initialWorkspace(), updatedAt: new Date().toISOString() }
    const parsed = JSON.parse(value) as WorkspaceState | LocalWorkspaceSnapshot
    if ('data' in parsed && parsed.data.graphs?.length) return parsed
    if ('graphs' in parsed && parsed.graphs?.length) return { data: parsed, updatedAt: new Date().toISOString() }
    return { data: initialWorkspace(), updatedAt: new Date().toISOString() }
  } catch {
    return { data: initialWorkspace(), updatedAt: new Date().toISOString() }
  }
}

export function saveWorkspace(ownerId: string, state: WorkspaceState, updatedAt = new Date().toISOString()) {
  localStorage.setItem(scopedKey(ownerId), JSON.stringify({ data: state, updatedAt }))
  return updatedAt
}

export function loadLocalOnlyWorkspace() {
  return loadWorkspaceSnapshot(LOCAL_ONLY_OWNER)
}

export function saveLocalOnlyWorkspace(state: WorkspaceState, updatedAt = new Date().toISOString()) {
  return saveWorkspace(LOCAL_ONLY_OWNER, state, updatedAt)
}
