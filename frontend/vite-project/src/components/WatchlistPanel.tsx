import { useState, useEffect } from 'react'
import type { WatchlistItem } from '../types/watchlist'
import { watchlistApi } from '../services/api'

export default function WatchlistPanel() {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [newTicker, setNewTicker] = useState('')

  const fetchWatchlist = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await watchlistApi.getWatchlist() as WatchlistItem[]
      setItems(data || [])
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unexpected error'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWatchlist()
  }, [])

  const handleAdd = async () => {
    const ticker = newTicker.trim().toUpperCase()
    if (!ticker) {
      setError('Please enter a ticker')
      return
    }
    setLoading(true)
    try {
      await watchlistApi.addToWatchlist(ticker)
      setNewTicker('')
      await fetchWatchlist()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unexpected error'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (ticker: string) => {
    setLoading(true)
    try {
      await watchlistApi.removeFromWatchlist(ticker)
      await fetchWatchlist()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unexpected error'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const getTierLabel = (tier: string | null) => {
    if (!tier) return '-'
    return tier.replace('_', ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase())
  }

  return (
    <div className="p-5 bg-surface rounded-lg border border-border">
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Ticker (e.g. NVDA)"
          value={newTicker}
          onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
          className="px-2 py-2 bg-surface-hover border border-border rounded-md text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary text-sm w-40"
        />
        <button
          onClick={handleAdd}
          disabled={loading || !newTicker.trim()}
          className="px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {loading ? 'Adding…' : 'Add to Watchlist'}
        </button>
        <button onClick={fetchWatchlist} disabled={loading} className="px-3 py-2 bg-surface border border-border rounded-md hover:bg-surface-hover transition-colors disabled:opacity-50">Refresh</button>
      </div>

      {error && <div className="text-error mb-4">{error}</div>}

      {items.length === 0 ? (
        <div className="text-muted italic">No watchlist items yet.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="p-4 bg-surface-hover rounded-lg border border-border flex justify-between items-start"
            >
              <div>
                <div className="text-lg font-130 text-foreground">{item.ticker}</div>
                {item.metadata ? (
                  <div className="mt-2 text-xs text-muted">
                    <div><span className="font-semibold">Sector:</span> {item.metadata.sector || '-'}</div>
                    <div><span className="font-semibold">Industry:</span> {item.metadata.industry || '-'}</div>
                    <div><span className="font-semibold">Country:</span> {item.metadata.country || '-'}</div>
                    <div><span className="font-semibold">Cap:</span> {getTierLabel(item.metadata.marketCapTier)}</div>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-muted italic">
                    Metadata not available
                  </div>
                )}
              </div>
              <button
                onClick={() => handleRemove(item.ticker)}
                disabled={loading}
                className="px-2.5 py-1 bg-error text-white text-xs rounded hover:bg-error/80 transition-colors disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
