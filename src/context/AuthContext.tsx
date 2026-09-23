import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getAuthUser, isGitHubLoginAvailable, login as pocketbaseLogin, loginWithGitHub as pocketbaseGitHubLogin, logout as pocketbaseLogout, register as pocketbaseRegister, requestEmailVerification, restoreAuth, type AuthUser } from '../lib/pocketbase'

const LOCAL_ACCESS_KEY = 'lexigraph-local-access-v1'
const localUser: AuthUser = { id: 'local-only', email: '', name: 'This device', verified: true, mode: 'local' }

interface AuthApi {
  user: AuthUser | null
  loading: boolean
  githubAvailable: boolean
  login: (email: string, password: string) => Promise<void>
  loginWithGitHub: () => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  resendVerification: (email: string) => Promise<void>
  useLocalWorkspace: () => void
  logout: () => void
}

const AuthContext = createContext<AuthApi | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => localStorage.getItem(LOCAL_ACCESS_KEY) === '1' ? localUser : getAuthUser())
  const [loading, setLoading] = useState(true)
  const [githubAvailable, setGitHubAvailable] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(LOCAL_ACCESS_KEY) === '1') {
      setLoading(false)
      return
    }
    let active = true
    Promise.all([restoreAuth(), isGitHubLoginAvailable()]).then(([restored, github]) => {
      if (!active) return
      setUser(restored)
      setGitHubAvailable(github)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const authenticated = await pocketbaseLogin(email, password)
    setUser(authenticated)
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    await pocketbaseRegister(name, email, password)
  }, [])

  const loginWithGitHub = useCallback(() => pocketbaseGitHubLogin().then(setUser), [])
  const resendVerification = useCallback((email: string) => requestEmailVerification(email), [])
  const useLocalWorkspace = useCallback(() => {
    pocketbaseLogout()
    localStorage.setItem(LOCAL_ACCESS_KEY, '1')
    setUser(localUser)
  }, [])

  const logout = useCallback(() => {
    pocketbaseLogout()
    localStorage.removeItem(LOCAL_ACCESS_KEY)
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, loading, githubAvailable, login, loginWithGitHub, register, resendVerification, useLocalWorkspace, logout }), [user, loading, githubAvailable, login, loginWithGitHub, register, resendVerification, useLocalWorkspace, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
