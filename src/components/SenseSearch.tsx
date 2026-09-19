import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getSenses, posLabel, searchWords } from '../lib/wordnet'
import type { SearchEntry, Sense } from '../types'

interface Props {
  onSelect: (sense: Sense) => void
  placeholder?: string
  initialQuery?: string
  compact?: boolean
}

export function SenseSearch({ onSelect, placeholder = 'Search all WordNet words…', initialQuery = '', compact = false }: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<SearchEntry[]>([])
  const [selectedWord, setSelectedWord] = useState('')
  const [senses, setSenses] = useState<Sense[]>([])
  const [loading, setLoading] = useState(false)
  const request = useRef(0)

  useEffect(() => setQuery(initialQuery), [initialQuery])
  useEffect(() => {
    const id = ++request.current
    const timeout = window.setTimeout(async () => {
      if (!query.trim() || selectedWord) return setResults([])
      try {
        const matches = await searchWords(query)
        if (id === request.current) setResults(matches)
      } catch { if (id === request.current) setResults([]) }
    }, 100)
    return () => window.clearTimeout(timeout)
  }, [query, selectedWord])

  async function chooseWord(entry: SearchEntry) {
    setSelectedWord(entry.lemma)
    setQuery(entry.lemma)
    setResults([])
    setLoading(true)
    try { setSenses(await getSenses(entry.lemma)) } finally { setLoading(false) }
  }

  function reset() {
    setSelectedWord('')
    setSenses([])
    setQuery('')
  }

  return <div className={`sense-search ${compact ? 'compact' : ''}`}>
    <div className="search-box">
      <Search size={20} />
      <input value={query} onChange={(event) => { setQuery(event.target.value); if (selectedWord) { setSelectedWord(''); setSenses([]) } }} placeholder={placeholder} aria-label={placeholder} autoComplete="off" />
      {query && <button className="bare-button" onClick={reset} aria-label="Clear search"><X size={17} /></button>}
    </div>
    {results.length > 0 && <div className="search-results" role="listbox">
      {results.map((entry) => <button key={entry.lemma} onClick={() => chooseWord(entry)}>
        <span>{entry.lemma}</span><small>{entry.pos.map((pos) => posLabel[pos]).join(' · ')} · {entry.count} {entry.count === 1 ? 'sense' : 'senses'}</small>
      </button>)}
    </div>}
    {(loading || senses.length > 0) && <div className="sense-chooser">
      <div className="eyebrow">Choose the intended meaning</div>
      {loading ? <div className="loading-line" /> : senses.map((sense, index) => <button key={sense.wordId} className="sense-option" onClick={() => { onSelect(sense); reset() }}>
        <span className="sense-number">{index + 1}</span>
        <span><strong>{sense.lemma}</strong> <em>{posLabel[sense.pos]}</em><span className="definition">{sense.definition}</span>
          {sense.examples[0] && <q>{sense.examples[0]}</q>}
        </span>
      </button>)}
    </div>}
  </div>
}
