import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, getToken, setToken } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const clearSession = useCallback(() => {
    setToken(null)
    try {
      localStorage.removeItem('waymark_user')
    } catch {
      /* storage unavailable */
    }
    setUser(null)
  }, [])

  useEffect(() => {
    let alive = true

    async function bootstrap() {
      if (!getToken()) {
        setLoading(false)
        return
      }
      try {
        const data = await api.auth.me()
        if (alive) setUser(data?.user || null)
      } catch {
        if (alive) clearSession()
      } finally {
        if (alive) setLoading(false)
      }
    }

    bootstrap()
    return () => {
      alive = false
    }
  }, [clearSession])

  useEffect(() => {
    const handleUnauthorized = () => setUser(null)
    window.addEventListener('waymark:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('waymark:unauthorized', handleUnauthorized)
  }, [])

  const login = useCallback(async (identifier, password) => {
    const data = await api.auth.login(identifier, password)
    setUser(data?.user || null)
    return data?.user
  }, [])

  const signup = useCallback(async (payload) => {
    const data = await api.auth.signup(payload)
    setUser(data?.user || null)
    return data?.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.auth.logout()
    } finally {
      clearSession()
    }
  }, [clearSession])

  const value = useMemo(
    () => ({ user, loading, login, signup, logout, clearSession }),
    [user, loading, login, signup, logout, clearSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
