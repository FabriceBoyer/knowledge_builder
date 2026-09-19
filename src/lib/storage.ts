import type { GraphDocument, WorkspaceState } from '../types'

export const STORAGE_KEY = 'lexigraph-workspace-v1'

function freshGraph(): GraphDocument {
  const now = Date.now()
  return { id: crypto.randomUUID(), name: 'Untitled concept', nodes: [], edges: [], createdAt: now, updatedAt: now }
}

export function initialWorkspace(): WorkspaceState {
  const graph = freshGraph()
  return { senses: [], graphs: [graph], activeGraphId: graph.id }
}

export function loadWorkspace(): WorkspaceState {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (!value) return initialWorkspace()
    const parsed = JSON.parse(value) as WorkspaceState
    if (!parsed.graphs?.length) return initialWorkspace()
    return parsed
  } catch {
    return initialWorkspace()
  }
}

export function saveWorkspace(state: WorkspaceState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}
