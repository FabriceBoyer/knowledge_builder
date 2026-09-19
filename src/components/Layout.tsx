import { BookOpen, CircleHelp, Cloud, CloudOff, FlaskConical, GitFork, Home, LoaderCircle, Moon, Sun } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'

const nav = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/words', label: 'Sense lab', icon: FlaskConical },
  { to: '/graph', label: 'Concept graph', icon: GitFork },
  { to: '/article', label: 'Article mapper', icon: BookOpen },
  { to: '/help', label: 'Help', icon: CircleHelp },
]

export function Layout({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'light')
  const { cloudStatus } = useWorkspace()
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('lexigraph-theme', theme)
  }, [theme])

  return <div className="shell">
    <header className="topbar">
      <NavLink to="/" className="brand" aria-label="Lexigraph home">
        <span className="brand-mark"><span /><span /><span /></span>
        <span>lexi<strong>graph</strong></span>
      </NavLink>
      <nav aria-label="Main navigation">
        {nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          <Icon size={17} /><span>{label}</span>
        </NavLink>)}
      </nav>
      <span className={`cloud-status ${cloudStatus}`} title={cloudStatus === 'synced' ? 'Saved locally and to PocketBase' : cloudStatus === 'saving' || cloudStatus === 'connecting' ? 'Synchronizing with PocketBase' : 'Saved locally; cloud sync is unavailable'} aria-label={`Cloud sync: ${cloudStatus}`}>
        {cloudStatus === 'synced' ? <Cloud size={17} /> : cloudStatus === 'saving' || cloudStatus === 'connecting' ? <LoaderCircle size={17} /> : <CloudOff size={17} />}
      </span>
      <button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}>
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </header>
    <main>{children}</main>
    <footer><span>WordNet 3.1 · Ideas become structures.</span><span>Everything stays in your browser.</span></footer>
  </div>
}
