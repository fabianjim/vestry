import type { Tag, JournalEntryType, JournalFilters } from '../types/journal'

const ENTRY_TYPES: { value: JournalEntryType; label: string }[] = [
  { value: 'BUY', label: 'Buy' },
  { value: 'SELL', label: 'Sell' },
  { value: 'INSIGHT', label: 'Insight' },
  { value: 'MARKET_EVENT', label: 'Market Event' },
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
    filters.from ||
    filters.to ||
    (filters.types && filters.types.length > 0) ||
    filters.ticker ||
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
          className="flex-1 px-2 py-2 bg-surface-hover border border-border rounded-md text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary text-sm"
        />
        <input
          type="text"
          placeholder="Ticker"
          value={filters.ticker || ''}
          onChange={(e) => update({ ticker: e.target.value.toUpperCase() || undefined })}
          className="w-full sm:w-32 px-2 py-2 bg-surface-hover border border-border rounded-md text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary text-sm"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted whitespace-nowrap">From:</label>
          <input
            type="date"
            value={filters.from ? filters.from.substring(0, 10) : ''}
            onChange={(e) => update({ from: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
            className="px-2 py-2 bg-surface-hover border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted whitespace-nowrap">To:</label>
          <input
            type="date"
            value={filters.to ? filters.to.substring(0, 10) : ''}
            onChange={(e) => update({ to: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
            className="px-2 py-2 bg-surface-hover border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {ENTRY_TYPES.map((type) => (
          <button
            key={type.value}
            type="button"
            onClick={() => toggleType(type.value)}
            className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
              filters.types?.includes(type.value)
                ? 'bg-primary/20 border-primary text-primary'
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
