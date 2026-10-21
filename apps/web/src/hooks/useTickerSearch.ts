import { useEffect, useState } from 'react'
import { stockApi } from '../services/api'
import type { TickerMatch } from '../types/stock'

const DEBOUNCE_MS = 150

/** Suggestions for a partial ticker or company name; an empty query clears them. */
export function useTickerSearch(query: string) {
  const [matches, setMatches] = useState<TickerMatch[]>([])
  const trimmed = query.trim()

  useEffect(() => {
    if (!trimmed) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      stockApi.searchTickers(trimmed, controller.signal)
        .then(setMatches)
        // Suggestions are optional; typing a ticker by hand still works.
        .catch(() => {})
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed])

  return trimmed ? matches : []
}
