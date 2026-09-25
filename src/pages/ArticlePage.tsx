import { ArrowRight, BookOpen, ExternalLink, FilePlus2, FlaskConical, Highlighter, Link as LinkIcon, Network, Search, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { SenseSearch } from '../components/SenseSearch'
import { useWorkspace } from '../context/WorkspaceContext'
import { fetchWikipediaArticle, suggestedTopics } from '../lib/wikipedia'
import { getSenses } from '../lib/wordnet'
import type { ArticleAnnotation, Sense, StoredSense } from '../types'

function findAvailablePassage(extract: string, text: string, annotations: ArticleAnnotation[]) {
  let start = extract.indexOf(text)
  while (start >= 0) {
    const end = start + text.length
    const overlaps = annotations.some((item) => item.start !== undefined && item.end !== undefined && start < item.end && end > item.start)
    if (!overlaps) return start
    start = extract.indexOf(text, start + 1)
  }
  return -1
}

const illustratedArticle = {
  title: 'How scientific inquiry builds reliable knowledge',
  url: '',
  source: 'example' as const,
  extract: `Scientific inquiry begins with a careful observation: a researcher notices a pattern, formulates a question, and states a hypothesis.

The hypothesis leads to a prediction that can be tested. An experiment specifies a method, controls relevant conditions, and records a measurement.

The resulting data are analyzed to distinguish signal from uncertainty. A result becomes evidence only when the analysis explains why the observed pattern is unlikely to be accidental.

Researchers compare the evidence with an alternative explanation, revise the model, and publish a conclusion that others can inspect.

Replication repeats the experiment with new samples. Agreement strengthens confidence; disagreement identifies an error, a limit, or a new question.

A good scientific explanation remains open to revision. It connects observation, prediction, evidence, and theory into a model that can guide the next experiment.`,
}

const illustratedMappings = [
  ['observation', 'observation'], ['pattern', 'pattern'], ['question', 'question'], ['hypothesis', 'hypothesis'], ['prediction', 'prediction'], ['tested', 'test'], ['experiment', 'experiment'], ['method', 'method'], ['conditions', 'condition'], ['measurement', 'measurement'], ['data', 'data'], ['analyzed', 'analyze'], ['signal', 'signal'], ['uncertainty', 'uncertainty'], ['A result', 'result'], ['evidence', 'evidence'], ['analysis', 'analysis'], ['accidental', 'accidental'], ['alternative explanation', 'explanation'], ['model', 'model'], ['conclusion', 'conclusion'], ['Replication', 'replication'], ['Agreement', 'agreement'], ['disagreement', 'disagreement'], ['error', 'error'], ['limit', 'limit'], ['theory', 'theory'],
] as const

const illustratedRelations = [
  ['observation', 'suggest', 'question'], ['question', 'guide', 'hypothesis'], ['hypothesis', 'predict', 'prediction'], ['prediction', 'test', 'experiment'], ['experiment', 'measure', 'measurement'], ['experiment', 'produce', 'data'], ['data', 'analyze', 'evidence'], ['uncertainty', 'qualify', 'evidence'], ['evidence', 'support', 'explanation'], ['explanation', 'revise', 'model'], ['replication', 'test', 'experiment'], ['agreement', 'strengthen', 'evidence'], ['disagreement', 'identify', 'error'], ['theory', 'explain', 'observation'], ['model', 'guide', 'experiment'],
] as const

export function ArticlePage() {
  const { state, setState, setArticle, addSense } = useWorkspace()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selection, setSelection] = useState<{ text: string; start: number; end: number } | null>(null)
  const [quickEntry, setQuickEntry] = useState('')
  const [quickNotice, setQuickNotice] = useState('')
  const [annotationQuery, setAnnotationQuery] = useState('')
  const [annotationGroup, setAnnotationGroup] = useState('')
  const [annotationLabel, setAnnotationLabel] = useState('')
  const articleRef = useRef<HTMLDivElement>(null)
  const article = state.article

  async function load(value = input) {
    setLoading(true); setError(''); setSelection(null)
    try {
      const result = await fetchWikipediaArticle(value)
      setArticle({ ...result, annotations: [] })
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load that article.') }
    finally { setLoading(false) }
  }

  async function loadIllustratedExample() {
    setLoading(true); setError(''); setSelection(null)
    try {
      const lemmas = [...new Set([...illustratedMappings.map(([, lemma]) => lemma), ...illustratedRelations.map(([, lemma]) => lemma)])]
      const resolved = await Promise.all(lemmas.map(async (lemma) => {
        const sense = (await getSenses(lemma))[0]
        if (!sense) throw new Error(`The bundled WordNet data is missing “${lemma}”.`)
        return [lemma, sense] as const
      }))
      const byLemma = new Map(resolved)
      const annotations: ArticleAnnotation[] = []
      illustratedMappings.forEach(([text, lemma]) => {
        const start = findAvailablePassage(illustratedArticle.extract, text, annotations)
        if (start >= 0) annotations.push({ id: crypto.randomUUID(), text, senseId: byLemma.get(lemma)!.wordId, start, end: start + text.length })
      })
      setState((current) => {
        const existing = current.graphs.find((graph) => graph.name === 'Scientific inquiry — complete mapped example')
        const graphId = existing?.id ?? crypto.randomUUID()
        const nodeLemmas = ['observation', 'question', 'hypothesis', 'prediction', 'experiment', 'measurement', 'data', 'uncertainty', 'evidence', 'explanation', 'model', 'replication', 'agreement', 'disagreement', 'error', 'theory'] as const
        const nodes = nodeLemmas.map((lemma, index) => ({ id: crypto.randomUUID(), senseId: byLemma.get(lemma)!.wordId, position: { x: 65 + (index % 4) * 240, y: 65 + Math.floor(index / 4) * 170 } }))
        const node = (senseId: string) => nodes.find((item) => item.senseId === senseId)!.id
        const graph = {
          id: graphId, name: 'Scientific inquiry — complete mapped example', createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now(), nodes,
          edges: illustratedRelations.map(([source, relation, target]) => ({ id: crypto.randomUUID(), source: node(byLemma.get(source)!.wordId), target: node(byLemma.get(target)!.wordId), linkerSenseId: byLemma.get(relation)!.wordId })),
        }
        const senses = [...current.senses]
        resolved.forEach(([, sense]) => { if (!senses.some((item) => item.wordId === sense.wordId)) senses.push({ ...sense, addedAt: Date.now(), lastUsedAt: Date.now() }) })
        return { ...current, senses, graphs: existing ? current.graphs.map((item) => item.id === existing.id ? graph : item) : [...current.graphs, graph], activeGraphId: graphId, article: { ...illustratedArticle, annotations } }
      })
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load the illustrated example.') }
    finally { setLoading(false) }
  }

  const captureSelection = useCallback(() => {
    const selected = window.getSelection()
    if (!selected || selected.isCollapsed || !articleRef.current || !selected.rangeCount) return
    const range = selected.getRangeAt(0)
    if (!articleRef.current.contains(range.commonAncestorContainer)) return
    const before = range.cloneRange()
    before.selectNodeContents(articleRef.current)
    before.setEnd(range.startContainer, range.startOffset)
    const start = before.toString().length
    const text = selected.toString().replace(/\s+/g, ' ').trim()
    if (text) setSelection({ text, start, end: start + selected.toString().length })
  }, [])

  useEffect(() => {
    document.addEventListener('selectionchange', captureSelection)
    return () => document.removeEventListener('selectionchange', captureSelection)
  }, [captureSelection])

  function annotate(sense: Sense) {
    if (!article || !selection) return
    addSense(sense)
    setArticle({ ...article, annotations: [...article.annotations, { id: crypto.randomUUID(), text: selection.text, senseId: sense.wordId, start: selection.start, end: selection.end }] })
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }

  async function importQuickAnnotations() {
    if (!article) return
    const lines = quickEntry.split('\n').map((line) => line.trim()).filter(Boolean)
    if (!lines.length) return
    setQuickNotice('Resolving WordNet senses…')
    try {
      const resolved = await Promise.all(lines.map(async (line, index) => {
        const separator = line.lastIndexOf('|')
        if (separator < 1) throw new Error(`Line ${index + 1} must use passage | word#sense-number.`)
        const text = line.slice(0, separator).trim()
        const token = line.slice(separator + 1).trim()
        const match = token.match(/^(.+?)\s*#\s*(\d+)$/)
        if (!text || !match) throw new Error(`Line ${index + 1} must use passage | word#sense-number.`)
        const choices = await getSenses(match[1].trim())
        const sense = choices[Number(match[2]) - 1]
        if (!sense) throw new Error(`WordNet has no sense ${match[2]} for “${match[1].trim()}”.`)
        return { text, sense }
      }))
      let added = 0
      setState((current) => {
        const currentArticle = current.article
        if (!currentArticle || currentArticle.url !== article.url) return current
        const annotations = [...currentArticle.annotations]
        const allSenses: StoredSense[] = [...current.senses]
        resolved.forEach(({ text, sense }) => {
          const start = findAvailablePassage(currentArticle.extract, text, annotations)
          if (start < 0) return
          if (!allSenses.some((item) => item.wordId === sense.wordId)) allSenses.push({ ...sense, addedAt: Date.now(), lastUsedAt: Date.now() })
          annotations.push({ id: crypto.randomUUID(), text, senseId: sense.wordId, start, end: start + text.length })
          added += 1
        })
        return { ...current, senses: allSenses, article: { ...currentArticle, annotations } }
      })
      setQuickNotice(`${added} ${added === 1 ? 'passage' : 'passages'} mapped.`)
      setQuickEntry('')
    } catch (error) {
      setQuickNotice(error instanceof Error ? error.message : 'Could not import these mappings.')
    }
  }

  const content = useMemo(() => {
    if (!article) return null
    const valid = [...article.annotations].filter((item) => item.start !== undefined && item.end !== undefined).sort((a, b) => a.start! - b.start!)
    const parts: React.ReactNode[] = []
    let cursor = 0
    valid.forEach((item) => {
      if (item.start! < cursor) return
      parts.push(article.extract.slice(cursor, item.start))
      const sense = state.senses.find((candidate) => candidate.wordId === item.senseId)
      parts.push(<mark key={item.id} title={sense?.definition}>{article.extract.slice(item.start, item.end)}</mark>)
      cursor = item.end!
    })
    parts.push(article.extract.slice(cursor))
    return parts
  }, [article, state.senses])
  const annotationGroups = useMemo(() => [...new Set(state.senses.flatMap((sense) => sense.groups ?? []))].sort(), [state.senses])
  const annotationLabels = useMemo(() => [...new Set(state.senses.flatMap((sense) => sense.labels ?? []))].sort(), [state.senses])
  const filteredAnnotations = useMemo(() => (article?.annotations ?? []).filter((annotation) => {
    const sense = state.senses.find((item) => item.wordId === annotation.senseId)
    const haystack = [annotation.text, sense?.lemma, sense?.definition, ...(sense?.groups ?? []), ...(sense?.labels ?? [])].join(' ').toLowerCase()
    return (!annotationQuery || haystack.includes(annotationQuery.toLowerCase())) && (!annotationGroup || sense?.groups?.includes(annotationGroup)) && (!annotationLabel || sense?.labels?.includes(annotationLabel))
  }), [annotationGroup, annotationLabel, annotationQuery, article?.annotations, state.senses])

  if (!article) return <div className="page-container article-landing">
    <section className="page-heading centered"><div className="eyebrow"><BookOpen size={14} /> Article mapper</div><h1>Turn reading into structure</h1><p>Load any English Wikipedia page. Select a word or phrase, resolve its meaning, then carry it into a concept graph.</p></section>
    <div className="url-loader"><LinkIcon size={20} /><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && load()} placeholder="Paste an English Wikipedia URL or article title" /><button className="primary-button" disabled={loading || !input.trim()} onClick={() => load()}>{loading ? 'Loading…' : 'Load article'} <Search size={17} /></button></div>
    {error && <p className="error-message">{error}</p>}
    <button className="illustrated-example" onClick={() => void loadIllustratedExample()} disabled={loading}><Sparkles size={19} /><span><strong>Open the complete mapped example</strong><small>A six-part scientific inquiry article with 27 WordNet annotations and a 16-concept relation graph.</small></span><ArrowRight size={18} /></button>
    <div className="suggested-heading"><FlaskConical size={18} /><div><h2>Reproducible science, suggested</h2><p>A few rich places to begin.</p></div></div>
    <div className="topic-grid">{suggestedTopics.map((topic, index) => <button key={topic.title} onClick={() => { setInput(topic.title); load(topic.title) }}><span>0{index + 1}</span><h3>{topic.title}</h3><p>{topic.blurb}</p><ExternalLink size={16} /></button>)}</div>
  </div>

  return <div className="article-workspace">
    <aside className="article-aside">
      <button className="back-link" onClick={() => setState((current) => ({ ...current, article: undefined }))}>← Choose another article</button>
      <div className="eyebrow">Reading map</div><h1>{article.title}</h1>
      {article.url && <a href={article.url} target="_blank" rel="noreferrer">View original <ExternalLink size={13} /></a>}
      <div className="annotation-count"><Highlighter size={18} /><span><strong>{article.annotations.length}</strong> mapped passages</span></div>
      <details className="quick-entry-panel article-quick-entry">
        <summary><FilePlus2 size={14} /> Quick map passages</summary>
        <p>One line per annotation: <code>exact passage | word#sense</code>. The passage must appear in this article.</p>
        <textarea value={quickEntry} onChange={(event) => { setQuickEntry(event.target.value); setQuickNotice('') }} placeholder={'a unified whole | system#8\noperate under rules | system#5'} aria-label="Quick article mapping entry" spellCheck="false" />
        <button className="secondary-button" onClick={() => void importQuickAnnotations()} disabled={!quickEntry.trim()}>Map passages</button>
        {quickNotice && <small className={quickNotice.startsWith('Resolving') || quickNotice.includes('mapped.') ? 'quick-notice success' : 'quick-notice error'}>{quickNotice}</small>}
      </details>
      {article.annotations.length > 0 && <div className="annotation-filters"><label><Search size={13} /><input value={annotationQuery} onChange={(event) => setAnnotationQuery(event.target.value)} placeholder="Find mapped passage or tag…" aria-label="Find mapped passages" /></label><div><select value={annotationGroup} onChange={(event) => setAnnotationGroup(event.target.value)} aria-label="Filter mapped passages by group"><option value="">All groups</option>{annotationGroups.map((group) => <option key={group}>{group}</option>)}</select><select value={annotationLabel} onChange={(event) => setAnnotationLabel(event.target.value)} aria-label="Filter mapped passages by label"><option value="">All labels</option>{annotationLabels.map((label) => <option key={label}>{label}</option>)}</select></div><small>Showing {filteredAnnotations.length} of {article.annotations.length}</small></div>}
      <div className="annotation-list">{filteredAnnotations.map((annotation) => {
        const sense = state.senses.find((item) => item.wordId === annotation.senseId)
        return <div key={annotation.id}><q>{annotation.text}</q><span>{sense?.lemma} · {sense?.definition}</span>{(sense?.groups?.length || sense?.labels?.length) ? <span className="annotation-tags">{[...(sense.groups ?? []).map((tag) => `#${tag}`), ...(sense.labels ?? [])].slice(0, 3).join(' · ')}</span> : null}<button onClick={() => setArticle({ ...article, annotations: article.annotations.filter((item) => item.id !== annotation.id) })}><X size={13} /></button></div>
      })}</div>
      <Link className="primary-button" to="/graph"><Network size={17} /> Build the concept graph</Link>
    </aside>
    <article className="wikipedia-paper">
      <header><div><span>{article.source === 'example' ? 'ILLUSTRATED EXAMPLE' : 'FROM WIKIPEDIA'}</span><h2>{article.title}</h2></div><span className="selection-tip">Select any word or phrase to map it</span></header>
      <div className="article-text" ref={articleRef} onMouseUp={captureSelection} onTouchEnd={() => window.setTimeout(captureSelection, 0)}>{content}</div>
    </article>
    {selection && <div className="selection-panel" role="dialog" aria-label="Map selected passage"><div className="selection-panel-header"><div><div className="eyebrow">Selected passage</div><q>{selection.text}</q></div><button className="icon-button" onClick={() => setSelection(null)} aria-label="Close selected passage"><X size={17} /></button></div><p>Choose the WordNet sense represented by this passage. Search is restricted to WordNet entries.</p><SenseSearch initialQuery={selection.text.toLowerCase()} onSelect={annotate} placeholder="Find its WordNet meaning…" /></div>}
  </div>
}
