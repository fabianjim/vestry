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
    <div style={{ padding: 20, backgroundColor: 'white', borderRadius: 8, border: '1px solid #dee2e6' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Ticker (e.g. NVDA)"
          value={newTicker}
          onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
          style={{ padding: 8, fontSize: 14, width: 160 }}
        />
        <button
          onClick={handleAdd}
          disabled={loading || !newTicker.trim()}
          style={{ backgroundColor: '#007bff', color: 'white' }}
        >
          {loading ? 'Adding…' : 'Add to Watchlist'}
        </button>
        <button onClick={fetchWatchlist} disabled={loading}>Refresh</button>
      </div>

      {error && <div style={{ color: '#dc3545', marginBottom: 16 }}>{error}</div>}

      {items.length === 0 ? (
        <div style={{ color: '#6c757d', fontStyle: 'italic' }}>No watchlist items yet.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                padding: 16,
                backgroundColor: '#f8f9fa',
                borderRadius: 8,
                border: '1px solid #dee2e6',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start'
              }}
            >
              <div>
                <div style={{ fontSize: 18, fontWeight: 'bold', color: '#495057' }}>{item.ticker}</div>
                {item.metadata ? (
                  <div style={{ marginTop: 8, fontSize: 13, color: '#6c757d' }}>
                    <div><strong>Sector:</strong> {item.metadata.sector || '-'}</div>
                    <div><strong>Industry:</strong> {item.metadata.industry || '-'}</div>
                    <div><strong>Country:</strong> {item.metadata.country || '-'}</div>
                    <div><strong>Cap:</strong> {getTierLabel(item.metadata.marketCapTier)}</div>
                  </div>
                ) : (
                  <div style={{ marginTop: 8, fontSize: 13, color: '#6c757d', fontStyle: 'italic' }}>
                    Metadata not available
                  </div>
                )}
              </div>
              <button
                onClick={() => handleRemove(item.ticker)}
                disabled={loading}
                style={{
                  padding: '4px 10px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12
                }}
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
