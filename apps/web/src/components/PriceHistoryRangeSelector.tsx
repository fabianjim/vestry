import type { PriceHistoryRange } from '../utils/priceHistory'

type Props = {
  value: PriceHistoryRange
  onChange: (range: PriceHistoryRange) => void
}

export default function PriceHistoryRangeSelector({ value, onChange }: Props) {
  return (
    <div role="group" aria-label="Price history period" className="flex rounded-md bg-foreground/5 p-0.5">
      {(['day', 'week', 'all'] as const).map(range => (
        <button
          key={range}
          type="button"
          aria-pressed={value === range}
          onClick={() => onChange(range)}
          className={`rounded px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            value === range ? 'bg-primary/15 text-foreground' : 'text-secondary hover:bg-foreground/5 hover:text-foreground'
          }`}
        >
          {range === 'day' ? 'Day' : range === 'week' ? 'Week' : 'All'}
        </button>
      ))}
    </div>
  )
}
