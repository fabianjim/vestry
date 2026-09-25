import { useEffect, useState } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { ApiError, authApi, onAuthFailure, type SessionUser } from '../services/api'

export function useApplicationSession(client: QueryClient) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    let active = true
    let checking = false
    let currentUser: SessionUser | null = null
    const controller = new AbortController()

    const expire = () => {
      if (!active) return
      active = false
      controller.abort()
      client.clear()
      setUser(null)
      setExpired(true)
    }

    const checkSession = async () => {
      if (!active || checking) return
      checking = true
      try {
        const next = await authApi.me(controller.signal)
        if (!active) return
        if (currentUser && (currentUser.userId !== next.userId || currentUser.isDemo !== next.isDemo)) {
          client.clear()
        }
        currentUser = next
        setUser(next)
        setError('')
      } catch (failure) {
        if (!active) return
        if (failure instanceof ApiError && failure.status === 401) expire()
        else setError('Unable to verify your session. Check your connection and try again.')
      } finally {
        checking = false
      }
    }

    const unsubscribe = onAuthFailure((failure, endpoint) => {
      if (!active) return
      if (failure.status === 401) expire()
      // Spring can return 403 for anonymous requests; verify before treating it as expiry.
      else if (endpoint !== '/auth/me') void checkSession()
    })
    const onVisible = () => { if (document.visibilityState === 'visible') void checkSession() }
    void checkSession()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', checkSession)
    return () => {
      active = false
      unsubscribe()
      controller.abort()
      client.clear()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', checkSession)
    }
  }, [client])

  return { user, error, expired }
}
