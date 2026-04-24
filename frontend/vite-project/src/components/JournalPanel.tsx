import { useState, useEffect, useRef } from 'react'
import type { JournalEntry, JournalEntryType } from '../types/journal'
import { journalApi } from '../services/api'
import { formatDateTime } from '../utils/dateUtils'

interface JournalPanelProps {
  highlightedEntryId?: number | null
}

export default function JournalPanel({ highlightedEntryId }: JournalPanelProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [entryType, setEntryType] = useState<JournalEntryType>('INSIGHT')
  const [body, setBody] = useState('')
  const [ticker, setTicker] = useState('')
  const [activeHighlight, setActiveHighlight] = useState<number | null>(null)
  const entryRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const fetchEntries = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await journalApi.getEntries() as JournalEntry[]
      setEntries(data || [])
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unexpected error'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEntries()
  }, [])

  // Handle external highlight prop
  useEffect(() => {
    if (highlightedEntryId != null) {
      setActiveHighlight(highlightedEntryId)
      
      // Scroll to the highlighted entry
      setTimeout(() => {
        const element = entryRefs.current[highlightedEntryId]
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)

      // Clear highlight after 3 seconds
      const timer = setTimeout(() => {
        setActiveHighlight(null)
      }, 3000)

      return () => clearTimeout(timer)
    }
  }, [highlightedEntryId])

  const handleSubmit = async () => {
    if (!body.trim()) {
      setError('Please enter a note')
      return
    }

    setLoading(true)
    try {
      await journalApi.createEntry({
        entryType,
        body: body.trim(),
        ticker: ticker.trim().toUpperCase() || null,
      })
      setBody('')
      setTicker('')
      setEntryType('INSIGHT')
      await fetchEntries()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unexpected error'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const getTypeColor = (type: JournalEntryType) => {
    switch (type) {
      case 'BUY': return 'text-gain'
      case 'SELL': return 'text-loss'
      case 'INSIGHT': return 'text-primary'
      case 'MARKET_EVENT': return 'text-event'
      default: return 'text-muted'
    }
  }

  const getTypeBg = (type: JournalEntryType) => {
    switch (type) {
      case 'BUY': return 'bg-gain/10'
      case 'SELL': return 'bg-loss/10'
      case 'INSIGHT': return 'bg-primary/10'
      case 'MARKET_EVENT': return 'bg-secondary/10'
      default: return 'bg-muted/10'
    }
  }

  return (
    <div className="p-5 bg-surface rounded-lg border border-border">
      <h4 className="text-muted mt-0 mb-3">New Journal Entry</h4>
      <div className="flex gap-3 mb-3 flex-wrap">
        <select
          value={entryType}
          onChange={(e) => setEntryType(e.target.value as JournalEntryType)}
          className="px-2 py-2 bg-surface-hover border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
        >
          <option value="INSIGHT">Insight</option>
          <option value="MARKET_EVENT">Market Event</option>
          <option value="BUY">Buy</option>
          <option value="SELL">Sell</option>
        </select>

        <input
          type="text"
          placeholder="Ticker (optional)"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          className="px-2 py-2 bg-surface-hover border border-border rounded-md text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary text-sm w-32"
        />
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your thoughts..."
        rows={3}
        className="w-full px-2 py-2 bg-surface-hover border border-border rounded-md text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary mb-3"
      />

      <div className="flex gap-2 mb-4">
        <button
          onClick={handleSubmit}
          disabled={loading || !body.trim()}
          className="px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Save Entry'}
        </button>
        <button
          onClick={fetchEntries}
          disabled={loading}
          className="px-3 py-2 bg-surface border border-border rounded-md hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error && <div className="text-error mb-4">{error}</div>}

      {entries.length === 0 ? (
        <div className="text-muted italic">No journal entries yet.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              ref={(el) => { entryRefs.current[entry.id] = el }}
              className={`p-3 rounded-md border transition-colors ${
                activeHighlight === entry.id
                  ? 'bg-primary/10 border-2 border-primary'
                  : `bg-surface-hover border-border ${getTypeBg(entry.entryType)}`
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-130 uppercase ${getTypeColor(entry.entryType)}`}>
                    {entry.entryType.replace('_', ' ')}
                  </span>
                  {entry.ticker && (
                    <span className="text-xs font-semibold text-foreground">{entry.ticker}</span>
                  )}
                </div>
                <span className="text-xs text-muted">{formatDateTime(entry.timestamp)}</span>
              </div>
              {entry.priceSnapshot != null && (
                <div className="text-xs text-muted mb-1">
                  Snapshot: ${entry.priceSnapshot.toFixed(2)}
                </div>
              )}
              <div className="text-sm text-foreground whitespace-pre-wrap">{entry.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
