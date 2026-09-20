import * as Automerge from '@automerge/automerge'
import type { WorkspaceState } from '../types'
import { flattenWorkspace, materializeWorkspace, type CrdtEntries } from './crdt'

export interface AutomergeWorkspaceDocument {
  entries: Record<string, string>
}

export type WorkspaceDoc = Automerge.Doc<AutomergeWorkspaceDocument>

export function createWorkspaceDocument(state: WorkspaceState) {
  return Automerge.change(Automerge.init<AutomergeWorkspaceDocument>(), 'Import workspace', (draft) => {
    draft.entries = {}
    flattenWorkspace(state).forEach((value, key) => { draft.entries[key] = JSON.stringify(value) })
  })
}

export function updateWorkspaceDocument(document: WorkspaceDoc, previous: WorkspaceState, next: WorkspaceState) {
  const before = flattenWorkspace(previous)
  const after = flattenWorkspace(next)
  const changedKeys = [...after].filter(([key, value]) => !before.has(key) || JSON.stringify(before.get(key)) !== JSON.stringify(value))
  const deletedKeys = [...before.keys()].filter((key) => !after.has(key))
  if (!changedKeys.length && !deletedKeys.length) return { document, change: null }
  const updated = Automerge.change(document, 'Update workspace', (draft) => {
    changedKeys.forEach(([key, value]) => { draft.entries[key] = JSON.stringify(value) })
    deletedKeys.forEach((key) => { delete draft.entries[key] })
  })
  return { document: updated, change: Automerge.getLastLocalChange(updated) ?? null }
}

export function materializeDocument(document: WorkspaceDoc) {
  const entries: CrdtEntries = {}
  Object.entries(document.entries).forEach(([key, value]) => { entries[key] = { clock: '', deleted: false, value: JSON.parse(value) } })
  return materializeWorkspace(entries)
}

export const saveDocument = (document: WorkspaceDoc) => Automerge.save(document)
export const loadDocument = (bytes: Uint8Array) => Automerge.load<AutomergeWorkspaceDocument>(bytes)
export const mergeDocuments = (left: WorkspaceDoc, right: WorkspaceDoc) => Automerge.merge(left, right)
export const applyDocumentChange = (document: WorkspaceDoc, change: Uint8Array) => Automerge.applyChanges(document, [change])[0]
export const documentHeads = (document: WorkspaceDoc) => Automerge.getHeads(document)
export const lastLocalChange = (document: WorkspaceDoc) => Automerge.getLastLocalChange(document) ?? null
export const cloneDocument = (document: WorkspaceDoc) => Automerge.clone(document)
