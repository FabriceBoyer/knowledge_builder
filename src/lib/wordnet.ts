import type { SearchEntry, Sense } from '../types'

const base = `${import.meta.env.BASE_URL}wordnet/`
let searchPromise: Promise<SearchEntry[]> | undefined
const chunks = new Map<string, Promise<Record<string, Sense[]>>>()

function keyFor(lemma: string) {
  const first = lemma.trim().toLowerCase()[0]
  return first && /[a-z]/.test(first) ? first : '_'
}

export async function loadSearchIndex(): Promise<SearchEntry[]> {
  searchPromise ??= fetch(`${base}search.json`).then((response) => {
    if (!response.ok) throw new Error('The WordNet index could not be loaded.')
    return response.json()
  })
  return searchPromise
}

export async function searchWords(query: string, limit = 12): Promise<SearchEntry[]> {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return []
  const entries = await loadSearchIndex()
  const prefix: SearchEntry[] = []
  const includes: SearchEntry[] = []
  for (const entry of entries) {
    if (entry.lemma.startsWith(normalized)) prefix.push(entry)
    else if (normalized.length >= 3 && entry.lemma.includes(normalized)) includes.push(entry)
    if (prefix.length >= limit) break
  }
  return [...prefix, ...includes].slice(0, limit)
}

export async function getSenses(lemma: string): Promise<Sense[]> {
  const normalized = lemma.trim().toLowerCase()
  const key = keyFor(normalized)
  if (!chunks.has(key)) {
    chunks.set(key, fetch(`${base}${key}.json`).then((response) => {
      if (!response.ok) throw new Error(`WordNet data for “${lemma}” could not be loaded.`)
      return response.json()
    }))
  }
  const chunk = await chunks.get(key)!
  return chunk[normalized] ?? []
}

export const posLabel: Record<string, string> = {
  n: 'noun', v: 'verb', a: 'adjective', r: 'adverb',
}
