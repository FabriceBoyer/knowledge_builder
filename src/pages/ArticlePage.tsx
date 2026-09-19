import { BookOpen, ExternalLink, FlaskConical, Highlighter, Link as LinkIcon, Network, Search, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { SenseSearch } from '../components/SenseSearch'
import { useWorkspace } from '../context/WorkspaceContext'
import { fetchWikipediaArticle, suggestedTopics } from '../lib/wikipedia'
import type { Sense } from '../types'

export function ArticlePage() {
  const { state, setState, setArticle, addSense } = useWorkspace()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selection, setSelection] = useState<{ text: string; start: number; end: number } | null>(null)
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

  function captureSelection() {
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
  }

  function annotate(sense: Sense) {
    if (!article || !selection) return
    addSense(sense)
    setArticle({ ...article, annotations: [...article.annotations, { id: crypto.randomUUID(), text: selection.text, senseId: sense.wordId, start: selection.start, end: selection.end }] })
    setSelection(null)
    window.getSelection()?.removeAllRanges()
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

  if (!article) return <div className="page-container article-landing">
    <section className="page-heading centered"><div className="eyebrow"><BookOpen size={14} /> Article mapper</div><h1>Turn reading into structure</h1><p>Load any English Wikipedia page. Select a word or phrase, resolve its meaning, then carry it into a concept graph.</p></section>
    <div className="url-loader"><LinkIcon size={20} /><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && load()} placeholder="Paste an English Wikipedia URL or article title" /><button className="primary-button" disabled={loading || !input.trim()} onClick={() => load()}>{loading ? 'Loading…' : 'Load article'} <Search size={17} /></button></div>
    {error && <p className="error-message">{error}</p>}
    <div className="suggested-heading"><FlaskConical size={18} /><div><h2>Reproducible science, suggested</h2><p>A few rich places to begin.</p></div></div>
    <div className="topic-grid">{suggestedTopics.map((topic, index) => <button key={topic.title} onClick={() => { setInput(topic.title); load(topic.title) }}><span>0{index + 1}</span><h3>{topic.title}</h3><p>{topic.blurb}</p><ExternalLink size={16} /></button>)}</div>
  </div>

  return <div className="article-workspace">
    <aside className="article-aside">
      <button className="back-link" onClick={() => setState((current) => ({ ...current, article: undefined }))}>← Choose another article</button>
      <div className="eyebrow">Reading map</div><h1>{article.title}</h1>
      <a href={article.url} target="_blank" rel="noreferrer">View original <ExternalLink size={13} /></a>
      <div className="annotation-count"><Highlighter size={18} /><span><strong>{article.annotations.length}</strong> mapped passages</span></div>
      <div className="annotation-list">{article.annotations.map((annotation) => {
        const sense = state.senses.find((item) => item.wordId === annotation.senseId)
        return <div key={annotation.id}><q>{annotation.text}</q><span>{sense?.lemma} · {sense?.definition}</span><button onClick={() => setArticle({ ...article, annotations: article.annotations.filter((item) => item.id !== annotation.id) })}><X size={13} /></button></div>
      })}</div>
      <Link className="primary-button" to="/graph"><Network size={17} /> Build the concept graph</Link>
    </aside>
    <article className="wikipedia-paper">
      <header><div><span>FROM WIKIPEDIA</span><h2>{article.title}</h2></div><span className="selection-tip">Select any word or phrase to map it</span></header>
      <div className="article-text" ref={articleRef} onMouseUp={captureSelection}>{content}</div>
    </article>
    {selection && <div className="selection-panel"><div className="selection-panel-header"><div><div className="eyebrow">Selected passage</div><q>{selection.text}</q></div><button className="icon-button" onClick={() => setSelection(null)}><X size={17} /></button></div><p>Choose the WordNet sense represented by this passage. Search is restricted to WordNet entries.</p><SenseSearch initialQuery={selection.text.toLowerCase()} onSelect={annotate} placeholder="Find its WordNet meaning…" /></div>}
  </div>
}
