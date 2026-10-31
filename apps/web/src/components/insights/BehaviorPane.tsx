import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { BehaviorReport } from '../../types/insights'
import type { JournalEntry } from '../../types/journal'
import { useWorkspaceBounds } from '../../hooks/useWorkspaceBounds'
import { insightsQueries } from '../../services/queries'
import { needHint, paneKey, reportDayLong, shownBehaviors } from '../../utils/insights'
import { ChevronLeftIcon, ChevronRightIcon } from '../icons'
import BehaviorCard from './BehaviorCard'

// how long the view takes to leave; the card slide runs a little longer
export const LEAVE_MS = 250
const QUIET = 'text-sm text-link hover:text-primary-hover transition-colors pointer-coarse:min-h-[40px]'
const ARROW = 'absolute top-1/2 z-10 -translate-y-1/2 inline-flex size-10 sm:size-12 items-center justify-center rounded-full border border-border bg-surface text-secondary shadow-sm hover:bg-surface-hover hover:text-foreground transition-[opacity,background-color,color] motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-0'

export type PaneMode = { kind: 'generating' } | { kind: 'report'; day: string; index: number }

type Props = {
  mode: PaneMode
  entries: JournalEntry[] | undefined
  onIndex: (index: number) => void
  onClose: () => void
  onViewPast: () => void
  onOpenEntry: (entryId: number) => void
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * The report over the whole Insights area: no page scroll, Back (or Esc) eases it away. While a report is
 * being built it holds a calm loading state instead.
 */
export default function BehaviorPane({ mode, entries, onIndex, onClose, onViewPast, onOpenEntry }: Props) {
  const bounds = useWorkspaceBounds(true)
  const stage = useRef<HTMLElement>(null)
  const [shown, setShown] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const report = useQuery({ ...insightsQueries.behaviorReport(mode.kind === 'report' ? mode.day : ''), enabled: mode.kind === 'report' })

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true))
    stage.current?.focus({ preventScroll: true })
    return () => cancelAnimationFrame(frame)
  }, [])

  const leave = (then: () => void) => {
    if (leaving) return
    setLeaving(true)
    setTimeout(then, reducedMotion() ? 0 : LEAVE_MS)
  }

  const day = mode.kind === 'report' ? mode.day : null
  const data = mode.kind === 'report' ? report.data : undefined
  const behaviors = data ? shownBehaviors(data.behaviors) : []
  const count = behaviors.length
  const current = mode.kind === 'report' ? Math.min(mode.index, Math.max(count - 1, 0)) : 0

  return (
    <section ref={stage} tabIndex={-1} aria-label={day ? `Report for ${reportDayLong(day)}` : 'Building your report'}
      // it only receives keys; the global focus-visible ring would outline the whole page
      style={{ ...bounds, outline: 'none' }}
      onKeyDown={e => {
        if (e.target instanceof HTMLTextAreaElement) return
        const action = paneKey(e.key, current, count)
        if (!action) return
        e.preventDefault()
        if (action === 'close') leave(onClose)
        else onIndex(action.move)
      }}
      className={`fixed z-30 flex flex-col bg-background ${bounds ? '' : 'inset-0'} transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
        shown && !leaving ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
      <header className="flex shrink-0 items-center justify-between gap-4 px-4 pt-4 sm:px-8">
        <button type="button" onClick={() => leave(onClose)} className={QUIET}>← Back</button>
        {day && (
          <p className="text-sm text-muted tabular-nums">
            {reportDayLong(day)}
            {count > 0 && <span aria-live="polite" className="ml-4">{current + 1} of {count}</span>}
          </p>
        )}
      </header>

      <div className="relative min-h-0 flex-1">
        {mode.kind === 'generating' ? (
          <Centered>
            <div role="status" className="w-full max-w-md">
              <p className="text-xl font-90">Reading your journal and trades</p>
              <p className="text-sm text-muted mt-1">You can leave this page; the report keeps building.</p>
              <div aria-hidden="true" className="mt-6 h-1 w-full overflow-hidden rounded-full bg-surface-active">
                <div className="h-full w-1/3 rounded-full bg-primary motion-safe:animate-bg-pulse" />
              </div>
            </div>
          </Centered>
        ) : !data ? (
          <Centered>
            <p className="text-sm text-muted" role={report.isError ? 'alert' : 'status'}>
              {report.isError ? 'This report can’t be loaded right now.' : 'Loading the report…'}
            </p>
          </Centered>
        ) : count === 0 ? (
          <Centered><p className="text-muted">Nothing in this report can be shown here.</p></Centered>
        ) : (
          <Cards report={data} current={current} entries={entries} onIndex={onIndex} onOpenEntry={onOpenEntry}
            onViewPast={() => leave(onViewPast)} />
        )}
      </div>
    </section>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center px-6 text-center">{children}</div>
}

function Cards({ report, current, entries, onIndex, onOpenEntry, onViewPast }: {
  report: BehaviorReport
  current: number
  entries: JournalEntry[] | undefined
  onIndex: (index: number) => void
  onOpenEntry: (entryId: number) => void
  onViewPast: () => void
}) {
  const behaviors = shownBehaviors(report.behaviors)
  const needs = report.needs.flatMap(need => needHint(need) ?? [])
  const last = behaviors.length - 1

  const footnote = (
    <div className="mt-5 border-t border-border pt-3">
      {needs.length > 0 && (
        <section aria-label="Still forming">
          <h3 className="text-sm font-130">Still forming</h3>
          <ul className="grid gap-x-8 sm:grid-cols-2">
            {needs.map(({ name, hint }) => (
              <li key={`${name}-${hint}`} className="py-1.5 text-sm">
                <span className="block">{name}</span>
                <span className="text-muted">{hint}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <button type="button" onClick={onViewPast} className={`${QUIET} mt-3`}>View past reports</button>
    </div>
  )

  return (
    <>
      <div className="h-full overflow-hidden">
        {/* the cards sit side by side and the row slides, so moving reads as moving between them;
            the row is wider than the view on purpose (data-scroll-x), and only the current card is visible */}
        <div data-scroll-x className="flex h-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(-${current * 100}%)` }}>
          {behaviors.map((behavior, i) => (
            <div key={`${behavior.kind}-${behavior.subject}`} aria-hidden={i !== current}
              // a card that slid away is hidden once the slide ends, so it can't be focused or read
              className={`h-full w-full shrink-0 overflow-y-auto px-14 py-3 sm:px-24 transition-[visibility] motion-reduce:transition-none ${
                i === current ? 'visible' : 'invisible delay-500 motion-reduce:delay-0'}`}>
              <BehaviorCard behavior={behavior} report={report} titleId={`behavior-${i}`} entries={entries}
                onOpenEntry={onOpenEntry} footnote={i === last ? footnote : undefined} />
            </div>
          ))}
        </div>
      </div>
      <button type="button" aria-label="Previous behavior" onClick={() => onIndex(current - 1)} disabled={current === 0}
        className={`${ARROW} left-2 sm:left-6`}>
        <ChevronLeftIcon />
      </button>
      <button type="button" aria-label="Next behavior" onClick={() => onIndex(current + 1)} disabled={current === last}
        className={`${ARROW} right-2 sm:right-6`}>
        <ChevronRightIcon />
      </button>
    </>
  )
}
