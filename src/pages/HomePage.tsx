import { ArrowRight, BookOpenText, Braces, Network, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'

export function HomePage() {
  const { state, cloudStatus } = useWorkspace()
  return <div className="home-page">
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><Sparkles size={14} /> A workbench for precise thought</div>
        <h1>Map meaning.<br /><span>Build understanding.</span></h1>
        <p>Choose exact WordNet senses, connect them into editable concept graphs, and map the ideas inside scientific writing.</p>
        <div className="hero-actions">
          <Link className="primary-button" to="/words">Start with a word <ArrowRight size={18} /></Link>
          <Link className="secondary-button" to="/article">Map an article</Link>
        </div>
        <div className="workspace-status"><span className="pulse" /> Auto-saved locally{cloudStatus === 'synced' ? ' · live across devices' : ' · waiting to sync'} · {state.senses.length} senses · {state.graphs.length} graphs</div>
      </div>
      <div className="hero-visual" aria-hidden="true">
        <div className="orbit orbit-one" /><div className="orbit orbit-two" />
        <div className="concept-card card-main"><span>emergence</span><small>a higher-order property arising from interactions</small></div>
        <div className="concept-card card-a">system</div>
        <div className="concept-card card-b">interaction</div>
        <div className="concept-card card-c">property</div>
        <svg><path d="M110 112 C175 55, 235 80, 290 132"/><path d="M112 116 C174 155, 225 175, 286 139"/><path d="M292 136 C348 118, 365 80, 404 58"/></svg>
      </div>
    </section>
    <section className="feature-grid">
      <article><div className="feature-icon coral"><BookOpenText /></div><span>01</span><h2>Disambiguate</h2><p>Never settle for a loose word. Select a specific definition, guided by examples and parts of speech.</p></article>
      <article><div className="feature-icon mint"><Network /></div><span>02</span><h2>Compose</h2><p>Arrange senses spatially and connect them using other meanings as semantic glue.</p></article>
      <article><div className="feature-icon blue"><Braces /></div><span>03</span><h2>Decode</h2><p>Annotate English Wikipedia text and reconstruct an article’s reasoning as one or more graphs.</p></article>
    </section>
  </div>
}
