import { describe, expect, it } from 'vitest'
import { titleFromWikipediaInput } from './wikipedia'

describe('titleFromWikipediaInput', () => {
  it('extracts and decodes an English Wikipedia title', () => {
    expect(titleFromWikipediaInput('https://en.wikipedia.org/wiki/Double-slit_experiment')).toBe('Double-slit experiment')
  })

  it('accepts a direct title', () => {
    expect(titleFromWikipediaInput('DNA replication')).toBe('DNA replication')
  })

  it('rejects unrelated URLs', () => {
    expect(() => titleFromWikipediaInput('https://example.com/wiki/Test')).toThrow()
  })
})
