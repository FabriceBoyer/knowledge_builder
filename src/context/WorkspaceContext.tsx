import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { initialWorkspace, loadWorkspace, saveWorkspace } from '../lib/storage'
import type { ArticleDocument, GraphDocument, Sense, WorkspaceState } from '../types'

interface WorkspaceApi {
  state: WorkspaceState
  addSense: (sense: Sense) => void
  removeSense: (senseId: string) => void
  setState: React.Dispatch<React.SetStateAction<WorkspaceState>>
  createGraph: () => void
  deleteGraph: (id: string) => void
  updateGraph: (graph: GraphDocument) => void
  setArticle: (article: ArticleDocument) => void
  clearWorkspace: () => void
}

const WorkspaceContext = createContext<WorkspaceApi | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(loadWorkspace)

  useEffect(() => {
    saveWorkspace(state)
  }, [state])

  const addSense = useCallback((sense: Sense) => setState((current) => {
    if (current.senses.some((item) => item.wordId === sense.wordId)) return current
    return { ...current, senses: [...current.senses, { ...sense, addedAt: Date.now() }] }
  }), [])

  const removeSense = useCallback((wordId: string) => setState((current) => ({
    ...current,
    senses: current.senses.filter((sense) => sense.wordId !== wordId),
  })), [])

  const createGraph = useCallback(() => setState((current) => {
    const now = Date.now()
    const graph: GraphDocument = { id: crypto.randomUUID(), name: `Concept ${current.graphs.length + 1}`, nodes: [], edges: [], createdAt: now, updatedAt: now }
    return { ...current, graphs: [...current.graphs, graph], activeGraphId: graph.id }
  }), [])

  const deleteGraph = useCallback((id: string) => setState((current) => {
    if (current.graphs.length === 1) return current
    const graphs = current.graphs.filter((graph) => graph.id !== id)
    return { ...current, graphs, activeGraphId: current.activeGraphId === id ? graphs[0].id : current.activeGraphId }
  }), [])

  const updateGraph = useCallback((graph: GraphDocument) => setState((current) => ({
    ...current,
    graphs: current.graphs.map((item) => item.id === graph.id ? { ...graph, updatedAt: Date.now() } : item),
  })), [])

  const setArticle = useCallback((article: ArticleDocument) => setState((current) => ({ ...current, article })), [])
  const clearWorkspace = useCallback(() => setState(initialWorkspace()), [])

  const value = useMemo(() => ({ state, addSense, removeSense, setState, createGraph, deleteGraph, updateGraph, setArticle, clearWorkspace }), [state, addSense, removeSense, createGraph, deleteGraph, updateGraph, setArticle, clearWorkspace])
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

// Context and hook intentionally live together so the persistence boundary stays explicit.
// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return context
}
