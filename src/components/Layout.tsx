import { BookOpen, CircleHelp, Cloud, CloudOff, Download, FlaskConical, GitFork, Home, LoaderCircle, LogOut, Moon, Sun } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { useAuth } from '../context/AuthContext'

const nav = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/words', label: 'Sense lab', icon: FlaskConical },
  { to: '/graph', label: 'Concept graph', icon: GitFork },
  { to: '/article', label: 'Article mapper', icon: BookOpen },
  { to: '/help', label: 'Help', icon: CircleHelp },
]

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function Layout({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'light')
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const { cloudStatus } = useWorkspace()
  const { user, logout } = useAuth()
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('lexigraph-theme', theme)
  }, [theme])
  useEffect(() => {
    const onInstallPrompt = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent) }
    window.addEventListener('beforeinstallprompt', onInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onInstallPrompt)
  }, [])
  async function installApp() {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

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
      <span className={`cloud-status ${cloudStatus}`} title={cloudStatus === 'local' ? 'Saved only in this browser' : cloudStatus === 'synced' ? 'Live sync active across your devices' : cloudStatus === 'saving' || cloudStatus === 'connecting' ? 'Merging changes with PocketBase' : 'Saved locally; changes will merge when reconnected'} aria-label={cloudStatus === 'local' ? 'Local-only workspace' : `Cloud sync: ${cloudStatus}`}>
        {cloudStatus === 'synced' ? <Cloud size={17} /> : cloudStatus === 'saving' || cloudStatus === 'connecting' ? <LoaderCircle size={17} /> : <CloudOff size={17} />}
      </span>
      {installPrompt && <button className="icon-button install-button" onClick={installApp} aria-label="Install Lexigraph" title="Install Lexigraph"><Download size={17} /></button>}
      <button className="user-button" onClick={logout} title={`Sign out ${user?.email}`} aria-label="Sign out"><span>{(user?.name || user?.email || '?')[0].toUpperCase()}</span><LogOut size={15} /></button>
      <button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}>
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </header>
    <main>{children}</main>
    <footer><span>WordNet 3.1 · Ideas become structures.</span><span>Everything stays in your browser.</span></footer>
  </div>
}
