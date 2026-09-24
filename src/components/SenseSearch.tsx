import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
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
  const [activeIndex, setActiveIndex] = useState(-1)
  const request = useRef(0)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => { setQuery(initialQuery); setActiveIndex(-1) }, [initialQuery])
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
  useEffect(() => {
    if (activeIndex >= 0) optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  async function chooseWord(entry: SearchEntry) {
    setActiveIndex(-1)
    setSelectedWord(entry.lemma)
    setQuery(entry.lemma)
    setResults([])
    setLoading(true)
    try { setSenses(await getSenses(entry.lemma)) } finally { setLoading(false) }
  }

  function reset() {
    setActiveIndex(-1)
    setSelectedWord('')
    setSenses([])
    setQuery('')
  }

  function chooseSense(sense: Sense) {
    onSelect(sense)
    reset()
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const options = selectedWord ? senses : results
    if (!options.length) {
      if (event.key === 'Escape') reset()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => event.key === 'ArrowDown'
        ? current >= options.length - 1 ? 0 : current + 1
        : current <= 0 ? options.length - 1 : current - 1)
      return
    }
    if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault()
      if (selectedWord) chooseSense(options[activeIndex] as Sense)
      else void chooseWord(options[activeIndex] as SearchEntry)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      if (selectedWord) { setSelectedWord(''); setSenses([]) }
      else setResults([])
      setActiveIndex(-1)
    }
  }

  return <div className={`sense-search ${compact ? 'compact' : ''}`}>
    <div className="search-box">
      <Search size={20} />
      <input value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(-1); if (selectedWord) { setSelectedWord(''); setSenses([]) } }} onKeyDown={onSearchKeyDown} placeholder={placeholder} aria-label={placeholder} aria-expanded={results.length > 0 || senses.length > 0} aria-activedescendant={activeIndex >= 0 ? `sense-search-option-${activeIndex}` : undefined} autoComplete="off" />
      {query && <button className="bare-button" onClick={reset} aria-label="Clear search"><X size={17} /></button>}
    </div>
    {results.length > 0 && <div className="search-results" role="listbox">
      {results.map((entry, index) => <button ref={(element) => { optionRefs.current[index] = element }} id={`sense-search-option-${index}`} role="option" aria-selected={activeIndex === index} className={activeIndex === index ? 'active' : ''} key={entry.lemma} onMouseEnter={() => setActiveIndex(index)} onClick={() => chooseWord(entry)}>
        <span>{entry.lemma}</span><small>{entry.pos.map((pos) => posLabel[pos]).join(' · ')} · {entry.count} {entry.count === 1 ? 'sense' : 'senses'}</small>
      </button>)}
    </div>}
    {(loading || senses.length > 0) && <div className="sense-chooser">
      <div className="eyebrow">Choose the intended meaning</div>
      {loading ? <div className="loading-line" /> : senses.map((sense, index) => <button ref={(element) => { optionRefs.current[index] = element }} id={`sense-search-option-${index}`} role="option" aria-selected={activeIndex === index} key={sense.wordId} className={`sense-option ${activeIndex === index ? 'active' : ''}`} onMouseEnter={() => setActiveIndex(index)} onClick={() => chooseSense(sense)}>
        <span className="sense-number">{index + 1}</span>
        <span><strong>{sense.lemma}</strong> <em>{posLabel[sense.pos]}</em><span className="definition">{sense.definition}</span>
          {sense.examples[0] && <q>{sense.examples[0]}</q>}
        </span>
      </button>)}
    </div>}
  </div>
}
