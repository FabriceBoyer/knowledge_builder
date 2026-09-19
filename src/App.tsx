import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ArticlePage } from './pages/ArticlePage'
import { GraphPage } from './pages/GraphPage'
import { HelpPage } from './pages/HelpPage'
import { HomePage } from './pages/HomePage'
import { WordsPage } from './pages/WordsPage'

export default function App() {
  return <Layout><Routes><Route path="/" element={<HomePage />} /><Route path="/words" element={<WordsPage />} /><Route path="/graph" element={<GraphPage />} /><Route path="/article" element={<ArticlePage />} /><Route path="/help" element={<HelpPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></Layout>
}
