import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { JournalEntry, JournalEntryType, JournalFilters, Tag } from '../types/journal'
import { journalApi } from '../services/api'
import { formatDateTime } from '../utils/dateUtils'
import { getDisplayBody, parseTagsFromBody } from '../utils/tagUtils'
import CalendarView from '../components/CalendarView'
import JournalFilterBar from '../components/JournalFilterBar'
import TagInput from '../components/TagInput'
import TagPills from '../components/TagPills'
import JournalDetailPanel from '../components/JournalDetailPanel'

export default function JournalPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [filters, setFilters] = useState<JournalFilters>(() => {
    const from = searchParams.get('from') || undefined
    const to = searchParams.get('to') || undefined
    const types = searchParams.getAll('types') as JournalEntryType[]
    const ticker = searchParams.get('ticker') || undefined
    const tagIds = searchParams.getAll('tagIds').map((id) => parseInt(id, 10))
    const query = searchParams.get('query') || undefined
    return {
      from,
      to,
      types: types.length > 0 ? types : undefined,
      ticker,
      tagIds: tagIds.length > 0 ? tagIds : undefined,
      query,
    }
  })

  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [entryType, setEntryType] = useState<JournalEntryType>('INSIGHT')
  const [ticker, setTicker] = useState('')
  const [body, setBody] = useState('')
  const [showNewEntry, setShowNewEntry] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [activeDate, setActiveDate] = useState<Date | null>(null)
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null)
  const [editBody, setEditBody] = useState('')
  const [editError, setEditError] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.title = 'Journal'
  }, [])

  useEffect(() => {
    const from = searchParams.get('from') || undefined
    const to = searchParams.get('to') || undefined
    const types = searchParams.getAll('types') as JournalEntryType[]
    const ticker = searchParams.get('ticker') || undefined
    const tagIds = searchParams.getAll('tagIds').map((id) => parseInt(id, 10))
    const query = searchParams.get('query') || undefined
    setFilters({
      from,
      to,
      types: types.length > 0 ? types : undefined,
      ticker,
      tagIds: tagIds.length > 0 ? tagIds : undefined,
      query,
    })
  }, [searchParams])

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const hasFilters =
        filters.from ||
        filters.to ||
        filters.types?.length ||
        filters.ticker ||
        filters.tagIds?.length ||
        filters.query

      const data = hasFilters
        ? ((await journalApi.getFilteredEntries({
            from: filters.from,
            to: filters.to,
            types: filters.types,
            ticker: filters.ticker,
            tagIds: filters.tagIds,
            query: filters.query,
          })) as JournalEntry[])
        : ((await journalApi.getEntries()) as JournalEntry[])
      setEntries(data || [])
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unexpected error'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [filters])

  const fetchTags = useCallback(async () => {
    try {
      const data = (await journalApi.getPopularTags('')) as Tag[]
      setAllTags(data || [])
    } catch (e) {
      console.error('Failed to fetch tags:', e)
    }
  }, [])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  const updateFilters = (newFilters: JournalFilters) => {
    const params = new URLSearchParams()
    if (newFilters.from) params.set('from', newFilters.from)
    if (newFilters.to) params.set('to', newFilters.to)
    newFilters.types?.forEach((t) => params.append('types', t))
    if (newFilters.ticker) params.set('ticker', newFilters.ticker)
    newFilters.tagIds?.forEach((id) => params.append('tagIds', id.toString()))
    if (newFilters.query) params.set('query', newFilters.query)
    setSearchParams(params, { replace: true })
  }

  const handleDayClick = (date: Date) => {
    const start = new Date(date)
    start.setHours(0, 0, 0, 0)
    const end = new Date(date)
    end.setHours(23, 59, 59, 999)
    setActiveDate(date)
    updateFilters({
      ...filters,
      from: start.toISOString(),
      to: end.toISOString(),
    })
  }

  const handleSubmit = async () => {
    if (!body.trim()) {
      setError('Please enter a note')
      return
    }
    const { body: finalBody, tags } = parseTagsFromBody(body)

    setLoading(true)
    try {
      await journalApi.createEntry({
        entryType,
        body: finalBody,
        ticker: ticker.trim().toUpperCase() || null,
        tags,
      })
      setBody('')
      setTicker('')
      setEntryType('INSIGHT')
      setShowNewEntry(false)
      updateFilters({})
      await fetchEntries()
      await fetchTags()
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
    setEditError('')
  }

  const handleSaveEdit = async (entryId: number) => {
    if (!editBody.trim()) {
      setEditError('Please enter a note')
      return
    }
    const { body: finalBody, tags } = parseTagsFromBody(editBody)

    setLoading(true)
    try {
      await journalApi.updateEntry(entryId, { body: finalBody, tags })
      setEditingEntryId(null)
      setEditBody('')
      setEditError('')
      await fetchEntries()
      await fetchTags()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unexpected error'
      setEditError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingEntryId(null)
    setEditBody('')
    setEditError('')
  }

  const handleDelete = async (entryId: number) => {
    if (!confirm('Delete this entry?')) return
    setLoading(true)
    try {
      await journalApi.deleteEntry(entryId)
      await fetchEntries()
      await fetchTags()
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
    <div className="max-w-6xl mx-auto mt-6 px-3 mb-8">
      <h2 className="text-2xl font-150 mb-6">Journal</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </span>
            <button
              onClick={() => setShowNewEntry((prev) => !prev)}
              className="px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary-hover transition-colors text-sm"
            >
              {showNewEntry ? 'Cancel' : 'New Entry'}
            </button>
          </div>

          {showNewEntry && (
            <div className="p-4 bg-surface rounded-lg border border-border space-y-3">
              <div className="flex gap-3 flex-wrap">
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
              <TagInput
                value={body}
                onChange={setBody}
                placeholder="Write your thoughts... Use #tag to add tags"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSubmit}
                  disabled={loading || !body.trim()}
                  className="px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  {loading ? 'Saving…' : 'Save Entry'}
                </button>
              </div>
              {error && <div className="text-error text-sm">{error}</div>}
            </div>
          )}

          <div ref={listRef} className="space-y-3">
            {loading && entries.length === 0 && (
              <div className="text-muted">Loading entries...</div>
            )}

            {entries.length === 0 && !loading && (
              <div className="text-muted italic">No journal entries match your filters.</div>
            )}

            {entries.map((entry) => (
              <div
                key={entry.id}
                onClick={() => !editingEntryId && setSelectedEntry(entry)}
                className={`p-4 bg-surface rounded-lg border border-border cursor-pointer hover:bg-surface-hover transition-colors ${getTypeBg(entry.entryType)}`}
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">{formatDateTime(entry.timestamp)}</span>
                    {editingEntryId !== entry.id && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEditClick(entry)
                          }}
                          className="text-xs text-primary hover:text-primary-hover px-2 py-1 rounded hover:bg-primary/10 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(entry.id)
                          }}
                          className="text-xs text-error hover:text-error px-2 py-1 rounded hover:bg-error/10 transition-colors"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {entry.priceSnapshot != null && (
                  <div className="text-xs text-muted mb-1">
                    Snapshot: ${entry.priceSnapshot.toFixed(2)}
                  </div>
                )}
                {editingEntryId === entry.id ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <TagInput
                      value={editBody}
                      onChange={setEditBody}
                      rows={3}
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleSaveEdit(entry.id)}
                        disabled={loading}
                        className="px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50"
                      >
                        {loading ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-3 py-1.5 bg-surface border border-border text-foreground text-xs rounded-md hover:bg-surface-hover transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                    {editError && <div className="text-error text-xs mt-1">{editError}</div>}
                  </div>
                ) : (
                  <>
                    <div className="text-sm text-foreground whitespace-pre-wrap">{getDisplayBody(entry.body)}</div>
                    <TagPills
                      tags={entry.tags}
                      onTagClick={(tag) => {
                        const current = filters.tagIds || []
                        if (!current.includes(tag.id)) {
                          updateFilters({ ...filters, tagIds: [...current, tag.id] })
                        }
                      }}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-4 bg-surface rounded-lg border border-border space-y-4">
            <JournalFilterBar
              filters={filters}
              availableTags={allTags}
              onChange={updateFilters}
            />
            <div className="border-t border-border" />
            <CalendarView
              onDayClick={handleDayClick}
              activeDate={activeDate}
              filters={filters}
              className="border-0 p-0"
            />
          </div>
        </div>
      </div>

      {selectedEntry && (
        <JournalDetailPanel
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onEntryClick={(entry) => setSelectedEntry(entry)}
        />
      )}
    </div>
  )
}
