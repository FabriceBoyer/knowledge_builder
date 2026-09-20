import type { ArticleDocument, GraphDocument, StoredSense, WorkspaceState } from '../types'

export interface CrdtOperation {
  opId: string
  deviceId: string
  clock: string
  entryKey: string
  deleted: boolean
  value?: unknown
}

export interface CrdtEntry {
  clock: string
  deleted: boolean
  value?: unknown
}

export type CrdtEntries = Record<string, CrdtEntry>

const part = (value: string) => encodeURIComponent(value)
const unpart = (value: string) => decodeURIComponent(value)

export function compareClocks(left: string, right: string) {
  return left.localeCompare(right)
}

export function nextClock(deviceId: string, counter: number, latestTimestamp = 0) {
  const timestamp = Math.max(Date.now(), latestTimestamp + 1).toString().padStart(13, '0')
  return `${timestamp}:${counter.toString().padStart(10, '0')}:${deviceId}`
}

export function flattenWorkspace(state: WorkspaceState) {
  const values = new Map<string, unknown>()
  values.set('workspace/activeGraphId', state.activeGraphId)
  state.senses.forEach((sense) => values.set(`sense/${part(sense.wordId)}`, sense))
  state.graphs.forEach((graph) => {
    values.set(`graph/${part(graph.id)}`, { id: graph.id, name: graph.name, createdAt: graph.createdAt, updatedAt: graph.updatedAt })
    graph.nodes.forEach((node) => values.set(`graph/${part(graph.id)}/node/${part(node.id)}`, node))
    graph.edges.forEach((edge) => values.set(`graph/${part(graph.id)}/edge/${part(edge.id)}`, edge))
  })
  if (state.article) {
    const { annotations, ...article } = state.article
    values.set('article/meta', article)
    annotations.forEach((annotation) => values.set(`article/annotation/${part(annotation.id)}`, annotation))
  }
  return values
}

export function diffWorkspace(previous: WorkspaceState | null, next: WorkspaceState, makeOperation: (entryKey: string, deleted: boolean, value?: unknown) => CrdtOperation) {
  const before = previous ? flattenWorkspace(previous) : new Map<string, unknown>()
  const after = flattenWorkspace(next)
  const operations: CrdtOperation[] = []
  after.forEach((value, key) => {
    if (!before.has(key) || JSON.stringify(before.get(key)) !== JSON.stringify(value)) operations.push(makeOperation(key, false, value))
  })
  before.forEach((_value, key) => {
    if (!after.has(key)) operations.push(makeOperation(key, true))
  })
  return operations
}

export function mergeOperation(entries: CrdtEntries, operation: CrdtOperation) {
  const current = entries[operation.entryKey]
  if (current && compareClocks(current.clock, operation.clock) >= 0) return false
  entries[operation.entryKey] = { clock: operation.clock, deleted: operation.deleted, value: operation.value }
  return true
}

export function materializeWorkspace(entries: CrdtEntries): WorkspaceState | null {
  const live = Object.entries(entries).filter(([, entry]) => !entry.deleted)
  const senses = live
    .filter(([key]) => key.startsWith('sense/'))
    .map(([, entry]) => entry.value as StoredSense)
    .sort((a, b) => a.addedAt - b.addedAt || a.wordId.localeCompare(b.wordId))

  const graphMeta = live.filter(([key]) => /^graph\/[^/]+$/.test(key))
  const graphs = graphMeta.map(([key, entry]) => {
    const graphId = unpart(key.split('/')[1])
    const meta = entry.value as Pick<GraphDocument, 'id' | 'name' | 'createdAt' | 'updatedAt'>
    const nodePrefix = `graph/${part(graphId)}/node/`
    const edgePrefix = `graph/${part(graphId)}/edge/`
    return {
      ...meta,
      nodes: live.filter(([childKey]) => childKey.startsWith(nodePrefix)).map(([, child]) => child.value as GraphDocument['nodes'][number]).sort((a, b) => a.id.localeCompare(b.id)),
      edges: live.filter(([childKey]) => childKey.startsWith(edgePrefix)).map(([, child]) => child.value as GraphDocument['edges'][number]).sort((a, b) => a.id.localeCompare(b.id)),
    }
  }).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))

  if (!graphs.length) return null
  const activeEntry = entries['workspace/activeGraphId']
  const requestedActive = activeEntry && !activeEntry.deleted ? String(activeEntry.value) : ''
  const activeGraphId = graphs.some((graph) => graph.id === requestedActive) ? requestedActive : graphs[0].id
  const articleEntry = entries['article/meta']
  let article: ArticleDocument | undefined
  if (articleEntry && !articleEntry.deleted) {
    const annotations = live
      .filter(([key]) => key.startsWith('article/annotation/'))
      .map(([, entry]) => entry.value as ArticleDocument['annotations'][number])
      .sort((a, b) => (a.start ?? 0) - (b.start ?? 0) || a.id.localeCompare(b.id))
    article = { ...(articleEntry.value as Omit<ArticleDocument, 'annotations'>), annotations }
  }
  return { senses, graphs, activeGraphId, ...(article ? { article } : {}) }
}
