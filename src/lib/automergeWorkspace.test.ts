import { describe, expect, it } from 'vitest'
import type { WorkspaceState } from '../types'
import { cloneDocument, createWorkspaceDocument, materializeDocument, mergeDocuments, updateWorkspaceDocument } from './automergeWorkspace'

const workspace = (): WorkspaceState => ({ senses: [], graphs: [{ id: 'g1', name: 'Concept', nodes: [], edges: [], createdAt: 1, updatedAt: 1 }], activeGraphId: 'g1' })

describe('Automerge workspace', () => {
  it('merges concurrent edits to different entities', () => {
    const baseState = workspace()
    const base = createWorkspaceDocument(baseState)
    const leftState = structuredClone(baseState)
    leftState.graphs[0].nodes.push({ id: 'left', senseId: 'sense-left', position: { x: 1, y: 2 } })
    const rightState = structuredClone(baseState)
    rightState.graphs[0].nodes.push({ id: 'right', senseId: 'sense-right', position: { x: 3, y: 4 } })
    const left = updateWorkspaceDocument(cloneDocument(base), baseState, leftState).document
    const right = updateWorkspaceDocument(cloneDocument(base), baseState, rightState).document
    expect(materializeDocument(mergeDocuments(left, right))?.graphs[0].nodes.map((node) => node.id)).toEqual(['left', 'right'])
  })

  it('preserves deletions after save materialization', () => {
    const initial = workspace()
    initial.senses.push({ id: 's', wordId: 'w', lemma: 'word', pos: 'n', words: ['word'], definition: 'definition', examples: [], addedAt: 1 })
    const document = createWorkspaceDocument(initial)
    const next = workspace()
    expect(materializeDocument(updateWorkspaceDocument(document, initial, next).document)?.senses).toEqual([])
  })
})
