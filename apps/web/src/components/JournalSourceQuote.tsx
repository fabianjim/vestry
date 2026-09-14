import type { JournalEntry, JournalEntryType } from '../types/journal'
import { formatDateTime } from '../utils/dateUtils'
import { getDisplayBody } from '../utils/tagUtils'

const typeColors: Record<JournalEntryType, string> = {
  BUY: 'text-gain/65',
  SELL: 'text-loss/65',
  INSIGHT: 'text-primary/65',
  REFLECTION: 'text-primary/65',
  MARKET_EVENT: 'text-event/65',
}

export default function JournalSourceQuote({ source }: { source: JournalEntry | null | undefined }) {
  return (
    <blockquote className="my-3 border-l-2 border-border pl-3">
      {source ? (
        <>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted mb-1">
            <span className={`font-130 uppercase ${typeColors[source.entryType]}`}>
              {source.entryType === 'REFLECTION' ? 'Reflect' : source.entryType.replace('_', ' ')}
            </span>
            <span>{formatDateTime(source.timestamp)}</span>
          </div>
          <div className="text-sm text-secondary whitespace-pre-wrap break-words">{getDisplayBody(source.body)}</div>
        </>
      ) : (
        <div className="text-sm text-muted">{source === null ? 'Source entry unavailable.' : 'Loading source entry…'}</div>
      )}
    </blockquote>
  )
}
