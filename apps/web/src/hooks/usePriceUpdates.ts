import { useEffect, useState } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { authApi } from '../services/api'
import { refreshPrices } from '../services/queryUpdates'

export function usePriceUpdates(client: QueryClient, sessionKey: string | null) {
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!sessionKey) return
    const events = new EventSource('/api/events', { withCredentials: true })
    let active = true
    let connected = false
    let checkedFailure = false
    const refresh = () => {
      if (!active) return
      void refreshPrices(client)
      setRevision(value => value + 1)
    }
    events.addEventListener('priceFetchCompleted', refresh)
    events.addEventListener('open', () => {
      if (connected) refresh() // Recover updates missed while disconnected.
      connected = true
      checkedFailure = false
    })
    events.addEventListener('error', () => {
      // EventSource hides HTTP status; the session listener handles confirmed expiry.
      if (!active || checkedFailure || document.visibilityState !== 'visible') return
      checkedFailure = true
      void authApi.me().catch(() => {})
    })
    return () => { active = false; events.close() }
  }, [client, sessionKey])
  return revision
}
