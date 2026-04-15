import { useState, useEffect } from 'react'
import type { JournalEntry, JournalEntryType } from '../types/journal'
import { journalApi } from '../services/api'
import { formatDateTime } from '../utils/dateUtils'

export default function JournalPanel() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [entryType, setEntryType] = useState<JournalEntryType>('INSIGHT')
  const [body, setBody] = useState('')
  const [ticker, setTicker] = useState('')

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
      case 'BUY': return '#28a745'
      case 'SELL': return '#dc3545'
      case 'INSIGHT': return '#6f42c1'
      case 'MARKET_EVENT': return '#fd7e14'
      default: return '#6c757d'
    }
  }

  return (
    <div>
      <h4>New Journal Entry</h4>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <select
          value={entryType}
          onChange={(e) => setEntryType(e.target.value as JournalEntryType)}
          style={{ padding: 8, fontSize: 14 }}
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
          style={{ padding: 8, fontSize: 14, width: 120 }}
        />
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your note..."
        rows={3}
        style={{
          width: '100%',
          padding: 8,
          boxSizing: 'border-box',
          fontSize: 14,
          resize: 'vertical',
          marginBottom: 12
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button
          onClick={handleSubmit}
          disabled={loading || !body.trim()}
          style={{ backgroundColor: '#007bff', color: 'white' }}
        >
          {loading ? 'Saving…' : 'Add Entry'}
        </button>
        <button onClick={fetchEntries} disabled={loading}>Refresh</button>
      </div>

      {error && <div style={{ color: '#dc3545', marginBottom: 16 }}>{error}</div>}

      <h4>Recent Entries</h4>
      {entries.length === 0 ? (
        <div style={{ color: '#6c757d', fontStyle: 'italic' }}>No journal entries yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {entries.map((entry) => (
            <div
              key={entry.id}
              style={{
                padding: 12,
                backgroundColor: '#f8f9fa',
                borderRadius: 6,
                border: '1px solid #dee2e6'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    color: getTypeColor(entry.entryType)
                  }}
                >
                  {entry.entryType.replace('_', ' ')}
                </span>
                <span style={{ fontSize: 12, color: '#6c757d' }}>
                  {formatDateTime(entry.timestamp)}
                </span>
              </div>
              {entry.ticker && (
                <div style={{ fontSize: 14, fontWeight: 'bold', color: '#495057', marginBottom: 4 }}>
                  {entry.ticker}
                  {entry.priceSnapshot != null && (
                    <span style={{ fontWeight: 'normal', color: '#6c757d', marginLeft: 8 }}>
                      @ ${entry.priceSnapshot.toFixed(2)}
                    </span>
                  )}
                </div>
              )}
              <div style={{ fontSize: 14, color: '#495057', whiteSpace: 'pre-wrap' }}>{entry.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
