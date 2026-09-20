import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import './styles.css'

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch((error) => {
      console.warn('Lexigraph offline app shell could not be registered.', error)
    })
  })
}

createRoot(document.getElementById('root')!).render(<StrictMode><HashRouter><AuthProvider><App /></AuthProvider></HashRouter></StrictMode>)
