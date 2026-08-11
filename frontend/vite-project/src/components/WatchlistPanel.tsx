import { useState, useEffect } from 'react'
import type { WatchlistItem } from '../types/watchlist'
import { watchlistApi } from '../services/api'

interface WatchlistPanelProps {
  isOpen?: boolean
  onCountChange?: (count: number) => void
  onBuyClick?: (ticker: string) => void
}

export default function WatchlistPanel({ isOpen = true, onCountChange, onBuyClick }: WatchlistPanelProps) {
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

  useEffect(() => {
    onCountChange?.(items.length)
  }, [items.length, onCountChange])

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
    <>
      {isOpen && (
        <>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Ticker"
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
              className="flex-1 px-2 py-2 bg-surface-hover border border-border rounded-md text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
            <button
              onClick={handleAdd}
              disabled={loading || !newTicker.trim()}
              className="px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50 text-sm"
            >
              {loading ? '…' : 'Add'}
            </button>
          </div>

          {error && <div className="text-error mb-4">{error}</div>}
        </>
      )}

      {items.length === 0 ? (
        <div className={`text-muted ${isOpen ? 'p-4 text-sm' : 'p-2 text-xs'}`}>No watchlist items yet.</div>
      ) : (
        <div className={isOpen ? 'flex flex-col gap-2' : 'p-1'}>
          {items.map((item) => {
            if (!isOpen) {
              return (
                <div
                  key={item.id}
                  className="flex justify-between items-center py-1 px-2 text-sm hover:bg-surface-hover rounded transition-colors"
                >
                  <span className="font-130">{item.ticker}</span>
                </div>
              )
            }

            return (
              <div
                key={item.id}
                className="group p-3 bg-surface-hover rounded-lg border border-border"
              >
                <div className="grid grid-cols-[1fr_auto] gap-x-2">
                  <div className="text-base font-130 text-foreground">{item.ticker}</div>
                  <div className="flex gap-2 justify-self-end self-start opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onBuyClick?.(item.ticker)}
                    disabled={loading}
                    className="px-2.5 py-1 bg-gain text-white text-xs rounded hover:bg-gain/80 transition-colors disabled:opacity-50"
                  >
                    Buy
                  </button>
                  <button
                    onClick={() => handleRemove(item.ticker)}
                    disabled={loading}
                    className="px-2.5 py-1 bg-error text-white text-xs rounded hover:bg-error/80 transition-colors disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
                  {item.metadata ? (
                    <div className="col-span-2 mt-1 text-xs text-secondary space-y-1">
                      <div>
                        <span className="font-semibold">{item.metadata.etf ? 'Asset Class' : 'Sector'}:</span>{' '}
                        {item.metadata.sector || '-'}
                      </div>
                      <div>
                        <span className="font-semibold">{item.metadata.etf ? 'Category' : 'Industry'}:</span>{' '}
                        {item.metadata.industry || '-'}
                      </div>
                      <div>
                        <span className="font-semibold">{item.metadata.etf ? 'Region' : 'Country'}:</span>{' '}
                        {item.metadata.country || '-'}
                      </div>
                      <div><span className="font-semibold">Cap:</span> {getTierLabel(item.metadata.marketCapTier)}</div>
                    </div>
                  ) : (
                    <div className="col-span-2 mt-1 text-xs text-muted italic">
                      Metadata not available
                    </div>
                  )}
                </div>
                
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
