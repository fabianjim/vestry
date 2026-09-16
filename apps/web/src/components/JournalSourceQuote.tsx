import { JOURNAL_STYLES, journalBadge } from '../constants/journalStyles'
import type { JournalEntry } from '../types/journal'
import { formatDateTime } from '../utils/dateUtils'
import { getDisplayBody } from '../utils/tagUtils'

export default function JournalSourceQuote({ source }: { source: JournalEntry | null | undefined }) {
  return (
    <blockquote className="my-3 border-l-2 border-border pl-3">
      {source ? (
        <>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted mb-1">
            <span className={journalBadge(source.entryType)}>
              {JOURNAL_STYLES[source.entryType].label}
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
