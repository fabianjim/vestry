import { useEffect, useState, type ReactNode } from 'react'
import { JOURNAL_STYLES } from '../../constants/journalStyles'
import { prefersReducedMotion } from '../../hooks/useHeroPlayback'
import { useScriptedSteps } from '../../hooks/useScriptedSteps'
import { marketDay } from '../../utils/dateUtils'
import { formatCurrency } from '../../utils/formatUtils'
import { groupTrades } from '../../utils/insightCharts'
import {
  behaviorTitle, consequence, positionOf, signedMoney, signedPercent, type Month, type Result,
} from '../../utils/insights'
import { BEHAVIOR, JOURNAL_ENTRIES, REPORT_AS_OF, SPY_BUY, TRADES } from './landingStory'

const MONTHS: Month[] = [{ key: '2026-05', label: 'May' }, { key: '2026-06', label: 'Jun' }]
const SWEEP_MS = 1300
// 0 shows only the SPY buy Reflect handed over, 1 sweeps the history in, 2 finds the behavior,
// 3 adds the observation, then one step per quote, then the question and the entry written about it.
const SWEEP = 1
const FOUND = 2
const OBSERVED = 3
const QUOTES = 4
const ASKED = QUOTES + BEHAVIOR.citations.length
const QUOTE_OFFSETS = BEHAVIOR.citations.map((_, index) => 3000 + index * 450)
const OFFSETS = [0, 250, 1750, 2400, ...QUOTE_OFFSETS, QUOTE_OFFSETS[QUOTE_OFFSETS.length - 1] + 600]

const shortDay = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
const dayLabel = (day: string) => shortDay.format(Date.parse(day))
const at = (day: string) => positionOf(day, MONTHS) ?? 0

const ENTRIES = new Map(JOURNAL_ENTRIES.map(entry => [entry.id, entry]))
const QUOTED_DAYS = new Map(BEHAVIOR.citations.map(c => [c.entryId, marketDay(ENTRIES.get(c.entryId)!.timestamp)]))
const GROUP = new Set(BEHAVIOR.trades.map(t => t.tradeId))
const GROUP_TRADES = groupTrades(BEHAVIOR)
const SPY_TRADE = TRADES.find(t => t.timestamp === SPY_BUY.timestamp)!.tradeId
const { group, baseline } = consequence(BEHAVIOR)

// Entries share one mark per day, as on the Insights evidence strip. A quoted day takes its quoted entry's color.
const ENTRY_DAYS = (() => {
  const counts = new Map<string, number>()
  JOURNAL_ENTRIES.forEach(entry => counts.set(marketDay(entry.timestamp), (counts.get(marketDay(entry.timestamp)) ?? 0) + 1))
  const colors = new Map([...QUOTED_DAYS].map(([id, day]) => [day, JOURNAL_STYLES[ENTRIES.get(id)!.entryType].color]))
  return [...counts].map(([day, count]) => ({ day, count, color: colors.get(day) }))
})()

const REVEAL = 'duration-500 ease-out motion-reduce:transition-none'
const reveal = (shown: boolean) => (shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1.5')
const tone = (value: number) => (value < 0 ? 'text-loss' : value > 0 ? 'text-gain' : 'text-secondary')
// The investor's own words, so they type like the hero's entries.
const NOTE = 'Honestly, I bought SPY on a headline. If it closes under $740, I’m out. Next time I write the exit first.'
const TYPE_MS = 18
// Long enough to see the new entry land on the timeline before the page moves on.
const SAVE_HANDOFF_MS = 1100

function ResultRow({ result, children }: { result: Result; children?: ReactNode }) {
  const { known } = result
  return (
    <div className="py-2.5 text-sm">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-secondary">{result.label}</span>
        {known && (
          <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
            <span className={`${tone(known.pnl)} font-130`}>{signedMoney(known.pnl)}</span>
            <span className={tone(known.avgReturn)}>{signedPercent(known.avgReturn)}</span>
          </span>
        )}
      </div>
      {known && <p className="mt-0.5 text-muted">{known.detail[0].toUpperCase() + known.detail.slice(1)}</p>}
      {children}
    </div>
  )
}

/** The Insight entry written about the behavior, typed once `start` is set; saving hands off to the next section. */
function Draft({ start, onSave }: { start: boolean; onSave?: () => void }) {
  const [typed, setTyped] = useState(() => (prefersReducedMotion() ? NOTE.length : 0))
  const [saved, setSaved] = useState(false)
  const ready = typed >= NOTE.length

  useEffect(() => {
    if (!start || ready) return
    const timer = window.setTimeout(() => setTyped(count => count + 1), typed === 0 ? 400 : TYPE_MS)
    return () => window.clearTimeout(timer)
  }, [start, ready, typed])

  const save = () => {
    setSaved(true)
    onSave?.()
  }

  return (
    <div>
      <p className="text-sm text-muted text-balance">
        Write an{' '}
        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] leading-none font-130 align-[1px] ${JOURNAL_STYLES.INSIGHT.badge}`}>
          {JOURNAL_STYLES.INSIGHT.label}
        </span>
        {' '}for your next report.
      </p>
      <div className={`mt-2 grid rounded-md border bg-surface p-3 text-sm text-foreground transition-colors duration-500 ${
        saved ? 'border-insight-border' : 'border-border-control'}`}>
        {/* The full text reserves the final height so typing never reflows the card. */}
        <span aria-hidden="true" className="invisible col-start-1 row-start-1">{NOTE}</span>
        <span aria-hidden="true" className="col-start-1 row-start-1">
          {NOTE.slice(0, typed)}
          {start && !ready && <span className="ml-px inline-block h-[1em] w-px translate-y-[0.15em] bg-foreground" />}
        </span>
        <span className="sr-only">{NOTE}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" disabled={!ready} onClick={save}
          className={`px-3 py-2 text-sm rounded-md border border-border text-foreground transition-colors cursor-pointer hover:bg-surface-hover disabled:cursor-default pointer-coarse:min-h-[40px] ${
            ready && !saved ? 'motion-safe:animate-bg-pulse' : ''}`}>
          {saved ? 'Saved to your journal' : 'Save to journal'}
        </button>
      </div>
    </div>
  )
}

interface LandingBehaviorProps {
  onSave?: () => void
}

/**
 * A read-only behavior report, played by a fixed script: the SPY buy from Reflect, then the history behind it,
 * then the habit it belongs to. Figures are counted from the story's trades; only the observation and question
 * stand in for AI text, and they appear whole rather than typed, unlike the investor's own words in the hero.
 */
export default function LandingBehavior({ onSave }: LandingBehaviorProps) {
  const { ref, step, done } = useScriptedSteps<HTMLDivElement>(OFFSETS)
  const [hovered, setHovered] = useState<number | null>(null)
  // The saved insight joins the timeline, then the page moves on to Improve.
  const [noted, setNoted] = useState(false)
  const found = step >= FOUND
  const active = hovered ?? (step >= QUOTES && step < ASKED ? BEHAVIOR.citations[step - QUOTES].entryId : null)
  const activeDay = active == null ? null : QUOTED_DAYS.get(active)
  const note = () => {
    setNoted(true)
    window.setTimeout(() => onSave?.(), prefersReducedMotion() ? 0 : SAVE_HANDOFF_MS)
  }
  // Marks appear as the sweep passes them; the delay is dropped afterwards so later changes are immediate.
  const sweepDelay = (day: string) => (step === SWEEP ? { transitionDelay: `${at(day) * SWEEP_MS}ms` } : undefined)

  return (
    <div ref={ref} className="w-full bg-surface p-6 rounded-lg border border-border text-left">
      <div role="img" aria-label="Trades and journal entries from May to June 2026, with the June buys and the entries quoted below marked"
        className="flex gap-3">
        <div aria-hidden="true" className="w-14 shrink-0 text-xs text-muted">
          <div className="flex h-8 items-center">Trades</div>
          <div className="flex h-6 items-center">Entries</div>
        </div>
        <div aria-hidden="true" className="relative min-w-0 flex-1">
          <div className="relative h-8">
            <div className="absolute inset-x-0 top-1/2 h-px bg-border-subtle" />
            {TRADES.map(trade => {
              const day = marketDay(trade.timestamp!)
              const buy = trade.side === 'BUY'
              const anchor = trade.tradeId === SPY_TRADE
              const lit = anchor || (found && GROUP.has(trade.tradeId))
              return (
                <svg key={trade.tradeId} viewBox="0 0 10 10" style={{ left: `${at(day) * 100}%`, ...sweepDelay(day) }}
                  className={`absolute size-2.5 -translate-x-1/2 transition-opacity duration-300 motion-reduce:transition-none ${
                    buy ? 'bottom-1/2 mb-0.5' : 'top-1/2 mt-0.5'} ${anchor || step >= SWEEP ? 'opacity-100' : 'opacity-0'}`}>
                  <title>{`${dayLabel(day)}: ${buy ? 'bought' : 'sold'} ${trade.shares} ${trade.ticker} at ${formatCurrency(trade.price!)}`}</title>
                  <polygon points={buy ? '5,1 9.5,9 0.5,9' : '5,9 9.5,1 0.5,1'} strokeWidth={1.2}
                    className={`transition-[fill,stroke] duration-300 ${
                      lit ? (buy ? 'fill-buy stroke-buy' : 'fill-sell stroke-sell') : `fill-transparent ${found ? 'stroke-border' : 'stroke-border-control'}`}`} />
                </svg>
              )
            })}
          </div>
          <div className="relative h-6">
            <div className="absolute inset-x-0 top-1/2 h-px bg-border-subtle" />
            {ENTRY_DAYS.map(({ day, count, color }) => (
              <span key={day} title={`${dayLabel(day)}: ${count} ${count === 1 ? 'entry' : 'entries'}`}
                style={{ left: `${at(day) * 100}%`, ...sweepDelay(day), ...(found && color ? { backgroundColor: color } : undefined) }}
                className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-out motion-reduce:transition-none ${
                  step >= SWEEP ? 'opacity-100' : 'opacity-0'} ${
                  found && color ? 'size-2.5 rounded-[3px]' : `h-3 w-px ${found ? 'bg-border' : 'bg-border-control'}`} ${
                  activeDay === day ? 'scale-[1.6]' : ''}`} />
            ))}
            <span title={`${dayLabel(REPORT_AS_OF)}: the insight you just wrote`}
              style={{ left: `${at(REPORT_AS_OF) * 100}%`, backgroundColor: JOURNAL_STYLES.INSIGHT.color }}
              className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[3px] transition-[opacity,scale] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none ${
                noted ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
          </div>
          <ol className="mt-1.5 flex">
            {MONTHS.map(month => (
              <li key={month.key} className="min-w-0 flex-1 text-xs text-muted">{month.label}</li>
            ))}
          </ol>
          <div className={`pointer-events-none absolute top-0 h-14 w-px bg-primary/60 ${step === SWEEP ? 'opacity-100' : 'opacity-0'}`}
            style={{ left: step >= SWEEP ? '100%' : '0%', transition: `left ${SWEEP_MS}ms linear, opacity 300ms` }} />
        </div>
      </div>

      <div className="mt-6 grid gap-x-12 gap-y-6 border-t border-border pt-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className={`min-w-0 transition-[opacity,translate] ${REVEAL} ${reveal(found)}`}>
          <h3 className="text-2xl font-130 leading-snug">{behaviorTitle(BEHAVIOR)}</h3>
          <div className="mt-5 divide-y divide-border border-y border-border">
            {group && (
              <ResultRow result={group}>
                <ul className="mt-1.5 text-muted tabular-nums">
                  {GROUP_TRADES.map(t => (
                    <li key={t.tradeId}>{dayLabel(t.date)}: bought {t.shares} {t.ticker} at {formatCurrency(t.price)}</li>
                  ))}
                </ul>
              </ResultRow>
            )}
            {baseline && <ResultRow result={baseline} />}
          </div>
        </div>

        <div className="min-w-0 lg:row-span-2">
          <p className={`text-lg leading-relaxed transition-[opacity,translate] ${REVEAL} ${reveal(step >= OBSERVED)}`}>
            {BEHAVIOR.observation}
          </p>
          <p className={`mt-5 mb-2 text-sm text-muted transition-opacity ${REVEAL} ${step >= QUOTES ? 'opacity-100' : 'opacity-0'}`}>
            From your journal
          </p>
          <ul className="space-y-2">
            {BEHAVIOR.citations.map((citation, index) => {
              const entry = ENTRIES.get(citation.entryId)!
              const { color } = JOURNAL_STYLES[entry.entryType]
              return (
                <li key={citation.entryId}
                  onPointerEnter={() => setHovered(citation.entryId)}
                  onPointerLeave={() => setHovered(null)}
                  // the entry's color, softened until its mark is the one in focus
                  style={{ borderColor: active === citation.entryId ? color : `color-mix(in srgb, ${color} 55%, transparent)` }}
                  className={`border-l-2 pl-3 text-sm transition-[opacity,translate,border-color] ${REVEAL} ${reveal(step >= QUOTES + index)}`}>
                  <span className="block text-xs text-muted">
                    {dayLabel(QUOTED_DAYS.get(citation.entryId)!)} · {JOURNAL_STYLES[entry.entryType].label} {entry.ticker}
                  </span>
                  <span className="text-secondary">“{citation.quote}”</span>
                </li>
              )
            })}
          </ul>
          <div className={`mt-6 transition-[opacity,translate] ${REVEAL} ${reveal(step >= ASKED)}`}>
            <p className="text-sm text-muted">A question to consider</p>
            <p className="text-lg font-90 mt-1">{BEHAVIOR.question}</p>
          </div>
        </div>
        {/* Last on phones; on wide screens it closes the left column, level with the question. */}
        <div inert={!done} className={`self-end transition-[opacity,translate] ${REVEAL} ${reveal(done)}`}>
          <Draft start={done} onSave={note} />
        </div>
      </div>
    </div>
  )
}
