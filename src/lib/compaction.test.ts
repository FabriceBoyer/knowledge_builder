import { describe, expect, it } from 'vitest'
import { CHECKPOINT_BYTES_THRESHOLD, CHECKPOINT_CHANGE_THRESHOLD, shouldCreateCheckpoint } from './compaction'

describe('Automerge compaction policy', () => {
  it('checkpoints when either replay limit is reached', () => {
    expect(shouldCreateCheckpoint(CHECKPOINT_CHANGE_THRESHOLD, 1, 0)).toBe(true)
    expect(shouldCreateCheckpoint(1, CHECKPOINT_BYTES_THRESHOLD, 0)).toBe(true)
  })

  it('never compacts while local changes are waiting to upload', () => {
    expect(shouldCreateCheckpoint(CHECKPOINT_CHANGE_THRESHOLD * 2, CHECKPOINT_BYTES_THRESHOLD * 2, 1)).toBe(false)
  })

  it('keeps a small replay journal intact', () => {
    expect(shouldCreateCheckpoint(CHECKPOINT_CHANGE_THRESHOLD - 1, CHECKPOINT_BYTES_THRESHOLD - 1, 0)).toBe(false)
  })
})
