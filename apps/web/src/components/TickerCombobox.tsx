import { useId, useState, type KeyboardEvent } from 'react'
import { useTickerSearch } from '../hooks/useTickerSearch'

export default function TickerCombobox({ label, value, onChange, onSelect, invalid, describedBy, className }: {
  label: string
  value: string
  onChange: (value: string) => void
  onSelect: (ticker: string) => void
  invalid?: boolean
  describedBy?: string
  className?: string
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const matches = useTickerSearch(open ? value : '')
  const expanded = open && matches.length > 0

  const select = (ticker: string) => {
    setOpen(false)
    setActive(-1)
    onSelect(ticker)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      if (matches.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((active + step + matches.length) % matches.length)
    } else if (e.key === 'Enter' && expanded && active >= 0) {
      e.preventDefault()
      select(matches[active].ticker)
    } else if (e.key === 'Escape' && expanded) {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="relative min-w-0">
      <input
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        placeholder="AAPL"
        value={value}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase())
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        maxLength={10}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className={className}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={`${label} suggestions`}
        hidden={!expanded}
        className="absolute left-0 top-full z-20 mt-1 w-[min(22rem,calc(100vw-2.5rem))] overflow-hidden p-1 rounded-lg border border-border bg-elevated shadow-floating"
      >
        {matches.map((match, index) => (
          <li
            key={match.ticker}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            // Keep focus in the input so blur does not close the list before the click lands.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => select(match.ticker)}
            onMouseEnter={() => setActive(index)}
            className={`flex items-baseline gap-3 rounded-md px-3 py-2 text-sm cursor-pointer ${index === active ? 'bg-surface-hover' : ''}`}
          >
            <span className="w-14 shrink-0 font-130 text-foreground">{match.ticker}</span>
            <span className="min-w-0 flex-1 truncate text-secondary">{match.name}</span>
            {match.etf && <span className="shrink-0 text-xs text-muted">ETF</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
