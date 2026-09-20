import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getAuthUser, isGitHubLoginAvailable, login as pocketbaseLogin, loginWithGitHub as pocketbaseGitHubLogin, logout as pocketbaseLogout, register as pocketbaseRegister, requestEmailVerification, restoreAuth, type AuthUser } from '../lib/pocketbase'

interface AuthApi {
  user: AuthUser | null
  loading: boolean
  githubAvailable: boolean
  login: (email: string, password: string) => Promise<void>
  loginWithGitHub: () => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  resendVerification: (email: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthApi | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(getAuthUser)
  const [loading, setLoading] = useState(true)
  const [githubAvailable, setGitHubAvailable] = useState(false)

  useEffect(() => {
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

  const logout = useCallback(() => {
    pocketbaseLogout()
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, loading, githubAvailable, login, loginWithGitHub, register, resendVerification, logout }), [user, loading, githubAvailable, login, loginWithGitHub, register, resendVerification, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
