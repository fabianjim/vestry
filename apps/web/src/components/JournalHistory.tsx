import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { InsightReport } from '../types/insights'
import type { JournalEntry } from '../types/journal'
import { findingId, historyDayLabel, journalHistory, type HistoryDay } from '../utils/insights'

type Props = {
  report: InsightReport
  entries: JournalEntry[] | undefined
  loading: boolean
  className?: string
}

const STEP = 14 // an 11px square and a 3px gap
// fixed so it can be reserved while entries load: the scroller (month row, seven rows of squares
// and room for a scrollbar) and the label line
const HEIGHT = 'h-[148px]'
const SQUARE = 'block size-[11px] rounded-[2px]'

function shade(day: HistoryDay): string {
  if (!day.inSpan) return ''
  if (day.findings.length) return 'bg-primary cursor-pointer'
  if (day.entries === 0) return 'border border-border-subtle'
  if (day.entries === 1) return 'bg-surface-active'
  return day.entries === 2 ? 'bg-border' : 'bg-border-control'
}

// The journal a report read, one square per day. Hover, focus or a tap explains a day;
// a blue day leads to the finding that quotes it (on touch, a second tap, so the label can be read first).
export default function JournalHistory({ report, entries, loading, className = '' }: Props) {
  const history = useMemo(() => entries && journalHistory(entries, report), [entries, report])
  const scroller = useRef<HTMLDivElement>(null)
  const pressed = useRef<{ date: string; touch: boolean; explained: boolean } | null>(null)
  const [active, setActive] = useState<HistoryDay | null>(null)

  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth
  }, [history])

  if (!report.entriesUpTo) return null
  if (!history) return loading ? <div aria-hidden="true" className={className}><div className={HEIGHT} /></div> : null

  const click = (day: HistoryDay) => {
    const press = pressed.current
    pressed.current = null
    setActive(day)
    if (press?.date === day.date && press.touch && !press.explained) return
    document.getElementById(findingId(day.findings[0]))?.scrollIntoView({ block: 'start' })
  }

  return (
    <section aria-label="Your journal in this report" className={className}>
      <div className={HEIGHT}>
        <div ref={scroller} className="h-[128px] overflow-x-auto overflow-y-hidden p-0.5 [scrollbar-width:thin]">
          <div className="relative h-4 mb-1 text-xs text-muted" style={{ width: history.weeks.length * STEP - 3 }} aria-hidden="true">
            {history.months.map(({ label, column }) => (
              <span key={`${label}-${column}`} className="absolute top-0 whitespace-nowrap" style={{ left: column * STEP }}>{label}</span>
            ))}
          </div>
          <div className="grid grid-flow-col grid-rows-7 gap-[3px] w-max" onPointerLeave={e => e.pointerType === 'mouse' && setActive(null)}>
            {history.weeks.flat().map(day => {
              const label = historyDayLabel(day)
              const outline = active?.date === day.date ? 'outline outline-1 outline-foreground' : ''
              const focus = 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground'
              const events = {
                'aria-label': label,
                className: `${SQUARE} ${shade(day)} ${outline} ${focus}`,
                onPointerEnter: (e: PointerEvent) => e.pointerType === 'mouse' && setActive(day),
                onPointerDown: (e: PointerEvent) => {
                  pressed.current = { date: day.date, touch: e.pointerType !== 'mouse', explained: active?.date === day.date }
                },
                onFocus: () => setActive(day),
                onBlur: () => setActive(current => (current?.date === day.date ? null : current)),
              }
              if (day.findings.length) return <button key={day.date} type="button" {...events} onClick={() => click(day)} />
              if (day.entries) return <span key={day.date} role="img" tabIndex={0} {...events} onClick={() => setActive(day)} />
              return <span key={day.date} aria-hidden="true" className={`${SQUARE} ${shade(day)}`} />
            })}
          </div>
        </div>
        <p aria-hidden="true" className="h-4 mt-1 text-xs text-muted truncate">{active && historyDayLabel(active)}</p>
      </div>
    </section>
  )
}
