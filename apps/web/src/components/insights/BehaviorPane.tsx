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
  onOpenEntry: (entryId: number) => void
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * The report over the whole Insights area: no page scroll, Back (or Esc) eases it away. While a report is
 * being built it holds a calm loading state instead.
 */
export default function BehaviorPane({ mode, entries, onIndex, onClose, onOpenEntry }: Props) {
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
  // the behaviors, then one closing page at index count
  const current = mode.kind === 'report' ? Math.min(mode.index, count) : 0

  // an arrow that just disabled itself, or a control on the card that slid away, would drop focus and the keys with it
  useEffect(() => {
    const active = document.activeElement
    if (!active || active === document.body || active.matches(':disabled, [aria-hidden="true"] *')) {
      stage.current?.focus({ preventScroll: true })
    }
  }, [current])

  return (
    <section ref={stage} tabIndex={-1} aria-label={day ? `Report for ${reportDayLong(day)}` : 'Building your report'}
      // it only receives keys; the global focus-visible ring would outline the whole page
      style={{ ...bounds, outline: 'none' }}
      onKeyDown={e => {
        if (e.target instanceof HTMLTextAreaElement) return
        const action = paneKey(e.key, current, count + 1)
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
            {current < count && <span aria-live="polite" className="ml-4">{current + 1} of {count}</span>}
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
            onReturn={() => leave(onClose)} />
        )}
      </div>
    </section>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center px-6 text-center">{children}</div>
}

function ClosingPage({ report, onReturn }: { report: BehaviorReport; onReturn: () => void }) {
  const needs = report.needs.flatMap(need => needHint(need) ?? [])

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-10 text-center">
      <div className="flex flex-col items-center">
        <h3 className="text-2xl font-130">Check back tomorrow</h3>
        <button type="button" onClick={onReturn}
          className="mt-6 px-4 py-2 border border-border text-foreground rounded-md hover:bg-surface-hover transition-colors text-sm pointer-coarse:min-h-[40px]">
          Return
        </button>
      </div>
      {needs.length > 0 && (
        <section aria-label="Still forming" className="w-full max-w-2xl">
          <h4 className="text-sm font-130">Still forming</h4>
          <ul className="mt-1 flex flex-wrap justify-center gap-x-8">
            {needs.map(({ name, hint }) => (
              <li key={`${name}-${hint}`} className="w-full py-1.5 text-sm sm:w-72">
                <span className="block">{name}</span>
                <span className="text-muted">{hint}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Cards({ report, current, entries, onIndex, onOpenEntry, onReturn }: {
  report: BehaviorReport
  current: number
  entries: JournalEntry[] | undefined
  onIndex: (index: number) => void
  onOpenEntry: (entryId: number) => void
  onReturn: () => void
}) {
  const behaviors = shownBehaviors(report.behaviors)
  const closing = behaviors.length
  const slide = (visible: boolean) =>
    // a card that slid away is hidden once the slide ends, so it can't be focused or read
    `h-full w-full shrink-0 overflow-y-auto px-14 py-3 sm:px-24 transition-[visibility] motion-reduce:transition-none ${
      visible ? 'visible' : 'invisible delay-500 motion-reduce:delay-0'}`

  return (
    <>
      <div className="h-full overflow-hidden">
        {/* the cards sit side by side and the row slides, so moving reads as moving between them;
            the row is wider than the view on purpose (data-scroll-x), and only the current card is visible */}
        <div data-scroll-x className="flex h-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(-${current * 100}%)` }}>
          {behaviors.map((behavior, i) => (
            <div key={`${behavior.kind}-${behavior.subject}`} aria-hidden={i !== current} className={slide(i === current)}>
              <BehaviorCard behavior={behavior} report={report} titleId={`behavior-${i}`} entries={entries}
                onOpenEntry={onOpenEntry} />
            </div>
          ))}
          <div aria-hidden={current !== closing} className={slide(current === closing)}>
            <ClosingPage report={report} onReturn={onReturn} />
          </div>
        </div>
      </div>
      <button type="button" aria-label="Previous behavior" onClick={() => onIndex(current - 1)} disabled={current === 0}
        className={`${ARROW} left-2 sm:left-6`}>
        <ChevronLeftIcon />
      </button>
      <button type="button" aria-label={current < closing - 1 ? 'Next behavior' : 'End of report'}
        onClick={() => onIndex(current + 1)} disabled={current === closing}
        className={`${ARROW} right-2 sm:right-6`}>
        <ChevronRightIcon />
      </button>
    </>
  )
}
