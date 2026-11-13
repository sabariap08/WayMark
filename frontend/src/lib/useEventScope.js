import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, errorMessage } from './api'
import { useAuth } from '../context/AuthContext'

export function useEventScope() {
  const { user } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const payload = await api.events.list()
      setEvents(Array.isArray(payload) ? payload : [])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const manageable = useMemo(() => {
    if (!user) return []
    if (user.isAdmin) return events
    return events.filter((event) => event.hostId && event.hostId === user.id)
  }, [events, user])

  return {
    user,
    events,
    manageable,
    loading,
    error,
    reload,
    canManage: Boolean(user?.isAdmin || manageable.length),
  }
}
