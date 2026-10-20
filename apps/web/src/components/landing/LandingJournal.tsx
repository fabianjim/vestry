import { useState } from 'react'
import { JOURNAL_STYLES } from '../../constants/journalStyles'
import { useScriptedSteps } from '../../hooks/useScriptedSteps'
import type { JournalEntry, JournalFilters } from '../../types/journal'
import { filterDateKey } from '../../utils/calendarSelection'
import { formatDateTime } from '../../utils/dateUtils'
import { matchesJournalFilters } from '../../utils/journalFilters'
import { ChevronLeftIcon, ChevronRightIcon } from '../icons'
import JournalSourceQuote from '../JournalSourceQuote'
import LandingEntryCard from './LandingEntryCard'
import StackItem from '../StackItem'
import { JOURNAL_ENTRIES, JOURNAL_SCRIPT, JOURNAL_TAGS, SPY_BUY } from './landingStory'

const FINAL_FILTER = JOURNAL_SCRIPT[JOURNAL_SCRIPT.length - 1]
// Let the last removed rows finish collapsing before the remaining entries open.
const OFFSETS = [...JOURNAL_SCRIPT.map(step => step.at), FINAL_FILTER.at + 600]
const SOURCES = new Map(JOURNAL_ENTRIES.map(entry => [entry.id, entry]))
const ENTRY_TYPES = FINAL_FILTER.applied.types ?? []
const FILTER_TAGS = JOURNAL_TAGS.filter(tag => FINAL_FILTER.applied.tagIds?.includes(tag.id))

/** Read-only copy of the journal filter bar (same classes as JournalFilterBar, compact layout). */
function FilterBar({ filters }: { filters: JournalFilters }) {
  return (
    <div inert className="flex flex-wrap items-center gap-2">
      {ENTRY_TYPES.map(type => {
        const active = filters.types?.includes(type) ?? false
        return (
          <span key={type}
            className={`px-2.5 py-1 text-xs rounded-md border transition-colors duration-300 ${
              active ? `${JOURNAL_STYLES[type].badge} ring-1 ring-primary` : 'bg-surface-hover border-border text-secondary'
            }`}>
            {JOURNAL_STYLES[type].label}
          </span>
        )
      })}
      <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
      {FILTER_TAGS.map(tag => {
        const active = filters.tagIds?.includes(tag.id) ?? false
        return (
          <span key={tag.id}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors duration-300 ${active ? 'text-foreground' : 'bg-surface-hover border-border text-secondary'}`}
            style={active ? { backgroundColor: `${tag.color}25`, borderColor: `${tag.color}50`, color: tag.color } : undefined}>
            #{tag.name}
          </span>
        )
      })}
    </div>
  )
}

const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const JUNE_OFFSET = new Date(Date.UTC(2026, 5, 1)).getUTCDay()
const JUNE_DAYS = Array.from({ length: 30 }, (_, i) => `2026-06-${String(i + 1).padStart(2, '0')}`)

/** Static June 2026 calendar with CalendarView's cells; shading alone shows entry density at this size. */
function MiniCalendar({ filters, entries }: { filters: JournalFilters; entries: JournalEntry[] }) {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const key = filterDateKey(entry.timestamp)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const maxCount = Math.max(...counts.values(), 1)
  const from = filterDateKey(filters.from)
  const to = filterDateKey(filters.to)
  const isActive = (key?: string) => Boolean(key && (from || to) && (!from || key >= from) && (!to || key <= to))

  return (
    <div inert className="p-4 bg-surface rounded-lg border border-border">
      <div className="flex items-center justify-between mb-4 text-secondary">
        <ChevronLeftIcon className="w-5 h-5" />
        <span className="text-foreground font-130">June 2026</span>
        <ChevronRightIcon className="w-5 h-5" />
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center select-none">
        {WEEK_DAYS.map((day, index) => <div key={index} className="text-xs text-muted py-1">{day}</div>)}
        {Array.from({ length: JUNE_OFFSET }, (_, index) => <div key={`pad-${index}`} />)}
        {JUNE_DAYS.map((key, index) => {
          const count = counts.get(key) ?? 0
          const intensity = count > 0 ? Math.max(0.2, count / maxCount) : 0
          const active = isActive(key)
          const column = (JUNE_OFFSET + index) % 7
          const connectsLeft = active && column > 0 && isActive(JUNE_DAYS[index - 1])
          const connectsRight = active && column < 6 && isActive(JUNE_DAYS[index + 1])
          return (
            <div key={key} className={`relative aspect-square flex flex-col items-center justify-center text-sm ${
              active ? 'text-primary' : count > 0 ? 'text-foreground' : 'text-secondary'
            }`}>
              <span aria-hidden="true"
                className={`absolute inset-0 transition-colors duration-300 ${connectsLeft ? '' : 'rounded-l-md'} ${connectsRight ? '' : 'rounded-r-md'} ${active ? 'bg-primary-soft' : ''}`}
                style={count > 0 && !active
                  ? { backgroundColor: `color-mix(in srgb, var(--color-primary) ${intensity * 35}%, var(--color-surface))` }
                  : undefined} />
              <span className="relative">{index + 1}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface LandingJournalProps {
  onSpyClick?: () => void
}

/** The journal, filtered by a fixed script: types, then tags, then the day the hero showed. */
export default function LandingJournal({ onSpyClick }: LandingJournalProps) {
  const { ref, step, done } = useScriptedSteps<HTMLDivElement>(OFFSETS)
  const { shown, applied } = JOURNAL_SCRIPT[Math.min(step, JOURNAL_SCRIPT.length - 1)]
  const [clicked, setClicked] = useState(false)
  const matching = JOURNAL_ENTRIES.filter(entry => matchesJournalFilters(entry, applied))
  // Like the app's calendar, counts follow the type and tag filters but not the selected days.
  const calendarEntries = JOURNAL_ENTRIES.filter(entry =>
    matchesJournalFilters(entry, { ...applied, from: undefined, to: undefined }))

  const openSpy = () => {
    setClicked(true)
    onSpyClick?.()
  }

  return (
    <div ref={ref} className="w-full space-y-4 text-left">
      <FilterBar filters={shown} />
      <div className="grid gap-6 md:grid-cols-[1fr_15rem]">
        <div>
          <div className="mb-2 text-sm text-muted tabular-nums">
            {matching.length} {matching.length === 1 ? 'entry' : 'entries'}
          </div>
          <div className={`h-[25rem] overflow-hidden ${matching.length > 3 ? '[mask-image:linear-gradient(to_bottom,black_75%,transparent)]' : ''}`}>
            {JOURNAL_ENTRIES.map(entry => {
              const isSpy = entry.id === SPY_BUY.id
              return (
                <StackItem key={entry.id} show={matching.includes(entry)}>
                  <LandingEntryCard
                    entry={entry}
                    time={formatDateTime(entry.timestamp)}
                    tags
                    expanded={done}
                    pulse={isSpy && done && !clicked}
                    onActivate={isSpy && done ? openSpy : undefined}
                  >
                    {entry.entryType === 'REFLECTION' && entry.sourceEntryId != null && (
                      <JournalSourceQuote source={SOURCES.get(entry.sourceEntryId)} />
                    )}
                  </LandingEntryCard>
                </StackItem>
              )
            })}
          </div>
        </div>
        <div className="hidden md:block self-start">
          <MiniCalendar filters={shown} entries={calendarEntries} />
        </div>
      </div>
    </div>
  )
}
