import type { GraphDocument, WorkspaceState } from '../types'

export const STORAGE_KEY = 'lexigraph-workspace-v1'

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

export function loadWorkspaceSnapshot(): LocalWorkspaceSnapshot {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (!value) return { data: initialWorkspace(), updatedAt: new Date().toISOString() }
    const parsed = JSON.parse(value) as WorkspaceState | LocalWorkspaceSnapshot
    if ('data' in parsed && parsed.data.graphs?.length) return parsed
    if ('graphs' in parsed && parsed.graphs?.length) return { data: parsed, updatedAt: new Date().toISOString() }
    return { data: initialWorkspace(), updatedAt: new Date().toISOString() }
  } catch {
    return { data: initialWorkspace(), updatedAt: new Date().toISOString() }
  }
}

export function saveWorkspace(state: WorkspaceState, updatedAt = new Date().toISOString()) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ data: state, updatedAt }))
  return updatedAt
}
