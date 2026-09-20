import { describe, expect, it, vi } from 'vitest'
import { diffWorkspace, materializeWorkspace, mergeOperation, nextClock, type CrdtEntries, type CrdtOperation } from './crdt'
import type { WorkspaceState } from '../types'

function workspace(): WorkspaceState {
  return { senses: [], graphs: [{ id: 'g1', name: 'Concept', nodes: [], edges: [], createdAt: 1, updatedAt: 1 }], activeGraphId: 'g1' }
}

describe('workspace CRDT', () => {
  it('converges regardless of operation arrival order', () => {
    const base = workspace()
    const left = structuredClone(base)
    left.graphs[0].nodes.push({ id: 'n1', senseId: 'sense-1', position: { x: 10, y: 20 } })
    const right = structuredClone(base)
    right.graphs[0].nodes.push({ id: 'n2', senseId: 'sense-2', position: { x: 30, y: 40 } })
    let sequence = 0
    const make = (deviceId: string) => (entryKey: string, deleted: boolean, value?: unknown): CrdtOperation => ({ opId: `${deviceId}-${sequence}`, deviceId, clock: `0000000000001:${String(sequence++).padStart(10, '0')}:${deviceId}`, entryKey, deleted, value })
    const operations = [...diffWorkspace(null, base, make('seed')), ...diffWorkspace(base, left, make('left')), ...diffWorkspace(base, right, make('right'))]
    const forward: CrdtEntries = {}
    const reverse: CrdtEntries = {}
    operations.forEach((operation) => mergeOperation(forward, operation))
    ;[...operations].reverse().forEach((operation) => mergeOperation(reverse, operation))
    expect(materializeWorkspace(forward)).toEqual(materializeWorkspace(reverse))
    expect(materializeWorkspace(forward)?.graphs[0].nodes.map((node) => node.id).sort()).toEqual(['n1', 'n2'])
  })

  it('keeps the newest value and tombstone for an entry', () => {
    const entries: CrdtEntries = {}
    mergeOperation(entries, { opId: 'new', deviceId: 'b', clock: '0000000000002:0000000001:b', entryKey: 'sense/x', deleted: true })
    expect(mergeOperation(entries, { opId: 'old', deviceId: 'a', clock: '0000000000001:0000000001:a', entryKey: 'sense/x', deleted: false, value: {} })).toBe(false)
    expect(entries['sense/x'].deleted).toBe(true)
  })

  it('creates monotonically increasing hybrid clocks', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100)
    const first = nextClock('device', 1, 200)
    const second = nextClock('device', 2, Number(first.split(':')[0]))
    expect(second > first).toBe(true)
    vi.restoreAllMocks()
  })
})
