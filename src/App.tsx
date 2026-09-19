import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useAuth } from './context/AuthContext'
import { WorkspaceProvider } from './context/WorkspaceContext'
import { ArticlePage } from './pages/ArticlePage'
import { AuthPage } from './pages/AuthPage'
import { GraphPage } from './pages/GraphPage'
import { HelpPage } from './pages/HelpPage'
import { HomePage } from './pages/HomePage'
import { WordsPage } from './pages/WordsPage'

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <div className="auth-loading"><span className="brand-mark"><span /><span /><span /></span><p>Restoring your workspace…</p></div>
  if (!user) return <AuthPage />
  return <WorkspaceProvider><Layout><Routes><Route path="/" element={<HomePage />} /><Route path="/words" element={<WordsPage />} /><Route path="/graph" element={<GraphPage />} /><Route path="/article" element={<ArticlePage />} /><Route path="/help" element={<HelpPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></Layout></WorkspaceProvider>
}
