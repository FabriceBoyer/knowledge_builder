import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getAuthUser, login as pocketbaseLogin, logout as pocketbaseLogout, register as pocketbaseRegister, restoreAuth, type AuthUser } from '../lib/pocketbase'

interface AuthApi {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthApi | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(getAuthUser)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    restoreAuth().then((restored) => { if (active) setUser(restored) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const authenticated = await pocketbaseLogin(email, password)
    setUser(authenticated)
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const authenticated = await pocketbaseRegister(name, email, password)
    setUser(authenticated)
  }, [])

  const logout = useCallback(() => {
    pocketbaseLogout()
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
