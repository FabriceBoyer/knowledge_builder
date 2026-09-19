import { Database, MousePointer2, Sparkles } from 'lucide-react'
import { SensePill } from '../components/SensePill'
import { SenseSearch } from '../components/SenseSearch'
import { useWorkspace } from '../context/WorkspaceContext'

export function WordsPage() {
  const { state, addSense, removeSense } = useWorkspace()
  return <div className="page-container">
    <section className="page-heading centered">
      <div className="eyebrow"><Database size={14} /> WordNet sense inventory</div>
      <h1>Your sense palette</h1>
      <p>Search for a WordNet word, then pick the exact meaning you intend. No free-form entries means every choice stays unambiguous.</p>
    </section>
    <div className="search-stage"><SenseSearch onSelect={addSense} /></div>
    <section className="palette-section">
      <div className="section-title"><div><h2>Collected senses</h2><p>Ready to use in any concept graph.</p></div><span className="count-badge">{state.senses.length}</span></div>
      {state.senses.length ? <div className="sense-grid">{state.senses.map((sense) => <SensePill key={sense.wordId} sense={sense} onRemove={() => removeSense(sense.wordId)} />)}</div> : <div className="empty-state">
        <div className="empty-orbit"><Sparkles /></div><h3>Your palette is waiting</h3><p>Try searching for “knowledge”, “cause”, or “emerge”.</p>
      </div>}
      <div className="tip"><MousePointer2 size={17} /><span><strong>Tip:</strong> hover over any collected word to revisit its full definition and example.</span></div>
    </section>
  </div>
}
