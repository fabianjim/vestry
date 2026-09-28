import { filterDateKey } from '../utils/calendarSelection'
import { JOURNAL_STYLES } from '../constants/journalStyles'
import type { Tag, JournalEntryType, JournalFilters } from '../types/journal'

const ENTRY_TYPES: { value: JournalEntryType; label: string }[] = [
  { value: 'BUY', label: 'Buy' },
  { value: 'SELL', label: 'Sell' },
  { value: 'INSIGHT', label: 'Insight' },
  { value: 'MARKET_EVENT', label: 'Market Event' },
  { value: 'REFLECTION', label: 'Reflect' },
]

interface JournalFilterBarProps {
  filters: JournalFilters
  availableTags: Tag[]
  onChange: (filters: JournalFilters) => void
  className?: string
}

export default function JournalFilterBar({ filters, availableTags, onChange, className = '' }: JournalFilterBarProps) {
  const update = (updates: Partial<JournalFilters>) => {
    onChange({ ...filters, ...updates })
  }

  const toggleType = (type: JournalEntryType) => {
    const current = filters.types || []
    if (current.includes(type)) {
      update({ types: current.filter((t) => t !== type) })
    } else {
      update({ types: [...current, type] })
    }
  }

  const toggleTag = (tagId: number) => {
    const current = filters.tagIds || []
    if (current.includes(tagId)) {
      update({ tagIds: current.filter((id) => id !== tagId) })
    } else {
      update({ tagIds: [...current, tagId] })
    }
  }

  const hasActiveFilters =
    filters.dates?.length ||
    filters.from ||
    filters.to ||
    (filters.types && filters.types.length > 0) ||
    (filters.tagIds && filters.tagIds.length > 0) ||
    filters.query

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search entries..."
          value={filters.query || ''}
          onChange={(e) => update({ query: e.target.value || undefined })}
          className="flex-1 px-2 py-2 bg-background border border-border-control rounded-md text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted whitespace-nowrap">From:</label>
            <input
              type="date"
              value={filterDateKey(filters.from)}
              onChange={(e) => update({ dates: undefined, from: e.target.value || undefined })}
              className="px-2 py-2 bg-background border border-border-control rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted whitespace-nowrap">To:</label>
            <input
              type="date"
              value={filterDateKey(filters.to)}
              onChange={(e) => update({ dates: undefined, to: e.target.value || undefined })}
              className="px-2 py-2 bg-background border border-border-control rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
        </div>

        {filters.dates?.length ? (
          <p className="text-xs text-muted">{filters.dates.length} individual dates selected. Editing From or To replaces this selection.</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {ENTRY_TYPES.map((type) => (
          <button
            key={type.value}
            type="button"
            onClick={() => toggleType(type.value)}
            aria-pressed={filters.types?.includes(type.value) ?? false}
            className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
              filters.types?.includes(type.value)
                ? `${JOURNAL_STYLES[type.value].badge} ring-1 ring-primary`
                : 'bg-surface-hover border-border text-secondary hover:text-foreground'
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>

      {availableTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {availableTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                filters.tagIds?.includes(tag.id)
                  ? 'text-foreground'
                  : 'bg-surface-hover text-secondary hover:text-foreground'
              }`}
              style={
                filters.tagIds?.includes(tag.id)
                  ? {
                      backgroundColor: `${tag.color}25`,
                      borderColor: `${tag.color}50`,
                      color: tag.color,
                    }
                  : undefined
              }
            >
              #{tag.name}
            </button>
          ))}
        </div>
      )}

      {hasActiveFilters && (
        <button
          type="button"
          onClick={() =>
            onChange({})
          }
          className="text-sm text-secondary hover:text-foreground underline"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
