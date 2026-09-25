import { Check, Database, MousePointer2, Sparkles, Tag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { SensePill } from '../components/SensePill'
import { SenseSearch } from '../components/SenseSearch'
import { useWorkspace } from '../context/WorkspaceContext'

export function WordsPage() {
  const { state, addSense, removeSense, updateSenseOrganization } = useWorkspace()
  const [groupFilter, setGroupFilter] = useState('')
  const [labelFilter, setLabelFilter] = useState('')
  const [paletteQuery, setPaletteQuery] = useState('')
  const [sort, setSort] = useState<'recent' | 'alphabetical' | 'oldest'>('recent')
  const [editingId, setEditingId] = useState('')
  const [groupsDraft, setGroupsDraft] = useState('')
  const [labelsDraft, setLabelsDraft] = useState('')
  const groups = useMemo(() => [...new Set(state.senses.flatMap((sense) => sense.groups ?? []))].sort(), [state.senses])
  const labels = useMemo(() => [...new Set(state.senses.flatMap((sense) => sense.labels ?? []))].sort(), [state.senses])
  const displayed = state.senses.filter((sense) => {
    const haystack = [sense.lemma, sense.definition, ...(sense.words ?? []), ...(sense.groups ?? []), ...(sense.labels ?? [])].join(' ').toLowerCase()
    return (!groupFilter || sense.groups?.includes(groupFilter)) && (!labelFilter || sense.labels?.includes(labelFilter)) && (!paletteQuery || haystack.includes(paletteQuery.toLowerCase()))
  }).sort((a, b) => sort === 'alphabetical' ? a.lemma.localeCompare(b.lemma) : sort === 'oldest' ? a.addedAt - b.addedAt : (b.lastUsedAt ?? b.addedAt) - (a.lastUsedAt ?? a.addedAt))
  const editingSense = state.senses.find((sense) => sense.wordId === editingId)

  function openOrganizer(senseId: string) {
    const sense = state.senses.find((item) => item.wordId === senseId)
    if (!sense) return
    setEditingId(senseId)
    setGroupsDraft((sense.groups ?? []).join(', '))
    setLabelsDraft((sense.labels ?? []).join(', '))
  }

  function saveOrganization() {
    if (!editingSense) return
    updateSenseOrganization(editingSense.wordId, groupsDraft.split(','), labelsDraft.split(','))
    setEditingId('')
  }
  return <div className="page-container">
    <section className="page-heading centered">
      <div className="eyebrow"><Database size={14} /> WordNet sense inventory</div>
      <h1>Your sense palette</h1>
      <p>Search for a WordNet word, then pick the exact meaning you intend. No free-form entries means every choice stays unambiguous.</p>
    </section>
    <div className="search-stage"><SenseSearch onSelect={addSense} keepFocusAfterSelect /><p className="chain-hint"><Check size={14} /> After selecting a sense, the search stays focused so you can immediately add the next one.</p></div>
    <section className="palette-section">
      <div className="section-title"><div><h2>Collected senses</h2><p>Ready to use in any concept graph. Add groups and labels to keep a large palette navigable.</p></div><span className="count-badge">{state.senses.length}</span></div>
      {state.senses.length ? <><div className="palette-filters"><label className="filter-query">Find in palette<input value={paletteQuery} onChange={(event) => setPaletteQuery(event.target.value)} placeholder="Word, definition, or tag…" /></label><label>Group<select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option value="">All groups</option>{groups.map((group) => <option key={group}>{group}</option>)}</select></label><label>Label<select value={labelFilter} onChange={(event) => setLabelFilter(event.target.value)}><option value="">All labels</option>{labels.map((label) => <option key={label}>{label}</option>)}</select></label><label>Sort<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="recent">Recently used</option><option value="alphabetical">A–Z</option><option value="oldest">First added</option></select></label>{(groupFilter || labelFilter || paletteQuery) && <button className="secondary-button" onClick={() => { setGroupFilter(''); setLabelFilter(''); setPaletteQuery('') }}>Clear filters</button>}</div>
      {editingSense && <div className="sense-organizer"><div><div className="eyebrow"><Tag size={13} /> Organize sense</div><strong>{editingSense.lemma}</strong><small>Groups are broad collections; labels are flexible keywords. Separate entries with commas.</small></div><label>Groups<input autoFocus value={groupsDraft} onChange={(event) => setGroupsDraft(event.target.value)} placeholder="e.g. research, methods" /></label><label>Labels<input value={labelsDraft} onChange={(event) => setLabelsDraft(event.target.value)} placeholder="e.g. core, review" /></label><button className="primary-button" onClick={saveOrganization}>Save</button><button className="secondary-button" onClick={() => setEditingId('')}>Cancel</button></div>}
      <div className="filtered-count">Showing {displayed.length} of {state.senses.length} senses</div><div className="sense-grid">{displayed.map((sense) => <SensePill key={sense.wordId} sense={sense} onOrganize={() => openOrganizer(sense.wordId)} onRemove={() => removeSense(sense.wordId)} />)}</div></> : <div className="empty-state">
        <div className="empty-orbit"><Sparkles /></div><h3>Your palette is waiting</h3><p>Try searching for “knowledge”, “cause”, or “emerge”.</p>
      </div>}
      <div className="tip"><MousePointer2 size={17} /><span><strong>Tip:</strong> hover over any collected word to revisit its full definition and example.</span></div>
    </section>
  </div>
}
