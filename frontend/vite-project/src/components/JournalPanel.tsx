import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import type { JournalEntry, JournalEntryType } from '../types/journal'
import { journalApi } from '../services/api'
import { formatDateTime } from '../utils/dateUtils'

export interface JournalPanelHandle {
  scrollToEntry: (id: number) => void
  refreshEntries: () => void
}

interface JournalPanelProps {
  activeJournalId?: number | null
  onClearActive?: () => void
}

const JournalPanel = forwardRef<JournalPanelHandle, JournalPanelProps>(function JournalPanel(
  { activeJournalId, onClearActive },
  ref
) {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [entryType, setEntryType] = useState<JournalEntryType>('INSIGHT')
  const [body, setBody] = useState('')
  const [ticker, setTicker] = useState('')
  const entryRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)

  const [editingEntryId, setEditingEntryId] = useState<number | null>(null)
  const [editBody, setEditBody] = useState('')
  const [deleteConfirmEntryId, setDeleteConfirmEntryId] = useState<number | null>(null)
  const [entryError, setEntryError] = useState('')

  useImperativeHandle(ref, () => ({
    scrollToEntry: (id: number) => {
      const el = entryRefs.current.get(id)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    },
    refreshEntries: () => {
      fetchEntries()
    }
  }))

  useEffect(() => {
    if (activeJournalId == null) return
    let listener: ((e: MouseEvent) => void) | null = null
    const timeout = setTimeout(() => {
      listener = (e: MouseEvent) => {
        const activeEl = entryRefs.current.get(activeJournalId)
        if (activeEl && !activeEl.contains(e.target as Node)) {
          onClearActive?.()
        }
      }
      document.addEventListener('click', listener)
    }, 0)
    return () => {
      clearTimeout(timeout)
      if (listener) document.removeEventListener('click', listener)
    }
  }, [activeJournalId, onClearActive])

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

  const handleEditClick = (entry: JournalEntry) => {
    setEditingEntryId(entry.id)
    setEditBody(entry.body)
    setEntryError('')
  }

  const handleSaveEdit = async (entryId: number) => {
    if (!editBody.trim()) {
      setEntryError('Please enter a note')
      return
    }
    setLoading(true)
    try {
      await journalApi.updateEntry(entryId, editBody.trim())
      setEditingEntryId(null)
      setEditBody('')
      await fetchEntries()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unexpected error'
      setEntryError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingEntryId(null)
    setEditBody('')
    setEntryError('')
  }

  const handleDeleteClick = (entryId: number) => {
    setDeleteConfirmEntryId(entryId)
    setEntryError('')
  }

  const handleConfirmDelete = async (entryId: number) => {
    setLoading(true)
    try {
      await journalApi.deleteEntry(entryId)
      setDeleteConfirmEntryId(null)
      await fetchEntries()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unexpected error'
      setEntryError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleCancelDelete = () => {
    setDeleteConfirmEntryId(null)
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
    <div ref={containerRef} className="p-5 bg-surface rounded-lg border border-border">
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
              ref={(el) => {
                if (el) entryRefs.current.set(entry.id, el)
              }}
              className={`relative group p-3 bg-surface-hover rounded-md border border-border ${getTypeBg(entry.entryType)} ${activeJournalId === entry.id ? 'outline-2 outline-primary outline-offset-2' : ''}`}
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
              {editingEntryId === entry.id ? (
                <div>
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={3}
                    className="w-full px-2 py-1 bg-transparent text-sm text-foreground resize-none border-none outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0"
                    autoFocus
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleSaveEdit(entry.id)}
                      disabled={loading}
                      className="px-2 py-1 bg-primary text-primary-foreground text-xs rounded hover:bg-primary-hover transition-colors disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="px-2 py-1 bg-surface border border-border text-foreground text-xs rounded hover:bg-surface-hover transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                  {entryError && editingEntryId === entry.id && (
                    <div className="text-error text-xs mt-1">{entryError}</div>
                  )}
                </div>
              ) : (
                <>
                  <div className="text-sm text-foreground whitespace-pre-wrap">{entry.body}</div>
                  <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEditClick(entry)}
                      className="px-2 py-1 text-xs text-primary hover:text-primary-hover bg-surface border border-border rounded hover:bg-surface-hover transition-colors"
                      title="Edit"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteClick(entry.id)}
                      className="px-2 py-1 text-xs text-error hover:text-error bg-surface border border-border rounded hover:bg-error/10 transition-colors"
                      title="Delete"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmEntryId != null && (
        <div
          className="fixed inset-0 bg-overlay flex justify-center items-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCancelDelete()
            }
          }}
        >
          <div className="bg-surface p-6 rounded-lg w-11/12 max-w-sm border border-border">
            <h3 className="text-lg font-150 mt-0 mb-4">Delete Journal Entry</h3>
            <p className="text-secondary mb-6">Are you sure you want to delete this journal entry? This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCancelDelete}
                className="px-3 py-2 bg-surface border border-border rounded-md hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmDelete(deleteConfirmEntryId)}
                disabled={loading}
                className="px-3 py-2 bg-error text-white rounded-md hover:bg-error/80 transition-colors disabled:opacity-50"
              >
                {loading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
            {entryError && <div className="text-error mt-3 text-sm">{entryError}</div>}
          </div>
        </div>
      )}
    </div>
  )
})

export default JournalPanel
