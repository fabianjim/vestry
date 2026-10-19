import type { ReactNode } from 'react'
import { JOURNAL_STYLES, journalBadge } from '../../constants/journalStyles'
import type { JournalEntry } from '../../types/journal'
import { formatCurrency } from '../../utils/formatUtils'
import TagPills from '../TagPills'

/** Read-only journal list item, matching the Journal page markup. */
export default function LandingEntryCard({ entry, time, body, tags = false, narrowCompact = false, expanded = true, pulse = false, onActivate, children }: {
  entry: JournalEntry
  time: string
  /** Replaces the plain body, e.g. with typed text. */
  body?: ReactNode
  tags?: boolean
  /** Below 1200px, collapse to a one-line row: badge, ticker and time. */
  narrowCompact?: boolean
  /** Keep a compact header while filters run, then smoothly reveal the entry. */
  expanded?: boolean
  pulse?: boolean
  onActivate?: () => void
  children?: ReactNode
}) {
  const interactive = onActivate != null
  const detail = narrowCompact ? 'max-[1199px]:hidden' : ''
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `${JOURNAL_STYLES[entry.entryType].label} ${entry.ticker ?? ''}: ${entry.body}` : undefined}
      onClick={onActivate}
      onKeyDown={interactive ? event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onActivate()
        }
      } : undefined}
      className={`p-3 bg-surface rounded-lg border border-border-subtle text-left ${
        interactive ? 'cursor-pointer transition-colors hover:bg-surface-hover active:bg-surface-active focus-visible:outline-offset-[-2px]' : ''
      } ${pulse ? 'motion-safe:animate-bg-pulse' : ''}`}
    >
      <div className="flex justify-between items-start gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={journalBadge(entry.entryType)}>{JOURNAL_STYLES[entry.entryType].label}</span>
          {entry.ticker && <span className="text-xs font-130 text-foreground">{entry.ticker}</span>}
          {tags && <TagPills tags={entry.tags} className={`mt-0! ${detail}`} />}
        </div>
        <span className="shrink-0 text-xs text-muted">{time}</span>
      </div>
      <div
        aria-hidden={!expanded}
        inert={!expanded}
        className={`grid transition-[grid-template-rows,opacity] duration-[450ms] ease-out motion-reduce:transition-none ${
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        } ${detail}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pt-1">
            {entry.priceSnapshot != null && (
              <div className="text-xs text-muted mb-1">Snapshot: {formatCurrency(entry.priceSnapshot)}</div>
            )}
            {children}
            <div className="text-sm text-foreground">{body ?? entry.body}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
