import { useViewState } from '../contexts/ViewState'
import { forwardRef, useCallback, useId, useImperativeHandle, useMemo, useRef, type KeyboardEvent } from 'react'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
  Customized,
} from 'recharts'
import { useActiveTooltipDataPoints, usePlotArea, useXAxis, useYAxis } from 'recharts/es6/hooks'
import { useQuery } from '@tanstack/react-query'
import { curveMonotoneX, curveStepAfter, curveStepBefore, line, ticks } from 'd3'
import { journalQueries, portfolioQueries } from '../services/queries'
import type { JournalEntry } from '../types/journal'
import type { Transaction } from '../types/transaction'
import {
  axisTicks,
  buildTimeline,
  dailyCloses,
  dateEntries,
  formatDateWindow,
  formatMarketDay,
  formatRowLabel,
  selectDates,
  selectRange,
  toRows,
  yDomain,
  type ChartRow,
  type DateWindow,
  type HistoryPoint,
  type PerformanceLens,
  type PerformanceRange,
  type Resolution,
} from '../utils/chartData'
import { marketDay } from '../utils/dateUtils'
import { formatCompactCurrency, formatCurrency, formatSignedCurrency } from '../utils/formatUtils'
import { getDisplayBody } from '../utils/tagUtils'
import { JOURNAL_STYLES, journalBadge } from '../constants/journalStyles'
import { GLASS_TOOLTIP_CLASS, GLIDING_TOOLTIP, trackTooltipDrift } from '../utils/chartTooltip'
import SegmentedControl from './SegmentedControl'
import SettingsPopover from './SettingsPopover'
import { CalendarIcon } from './icons'

export interface PortfolioChartHandle {
  showDay: (date: Date) => void
  scrollIntoView: () => void
}

interface Props {
  onEntryClick?: (entry: JournalEntry) => void
}

const LENSES = [
  { value: 'value', label: 'Value' },
  { value: 'gain', label: 'Gain' },
] as const

const RANGES = [
  { value: '1D', label: '1D' },
  { value: '1W', label: '1W' },
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: 'ALL', label: 'All' },
] as const

const GAIN_LABELS: Record<Exclude<PerformanceRange, '1D'>, string> = {
  '1W': 'Gain, past week',
  '1M': 'Gain, past month',
  '3M': 'Gain, past 3 months',
  ALL: 'Gain, all time',
}

// Pixels reserved under the plot for journal marks, inside the plot so the tooltip follows into it.
const LANE_HEIGHT = 44
const MARK_SPACING = 9
const MAX_MARKS = 3

const signTone = (amount: number) => amount > 0 ? 'text-gain-emphasis' : amount < 0 ? 'text-loss-emphasis' : 'text-foreground'
const sharesFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 })

function tradeLines(trades: Transaction[]): string[] {
  const shares = new Map<string, number>()
  for (const tx of trades) {
    const key = `${tx.type === 'BUY' ? 'Bought' : 'Sold'}\u0000${tx.ticker}`
    shares.set(key, (shares.get(key) ?? 0) + tx.shares)
  }
  return [...shares].map(([key, total]) => {
    const [verb, ticker] = key.split('\u0000')
    return `${verb} ${sharesFormat.format(total)} ${ticker}`
  })
}

/** Shades the gap between the line and its reference (money in, or zero): gain above, loss below. */
function GainBand({ rows, lens, domain }: { rows: ChartRow[]; lens: PerformanceLens; domain: [number, number] }) {
  const xAxis = useXAxis(0)
  const yAxis = useYAxis(0)
  const plot = usePlotArea()
  const id = `band-${useId().replace(/:/g, '')}`
  if (!xAxis || !yAxis || !plot || rows.length < 2) return null

  const x = (row: ChartRow) => Number(xAxis.scale(row.x))
  const top = (row: ChartRow) => Number(yAxis.scale(lens === 'value' ? row.value : row.gain))
  const bottom = (row: ChartRow) => {
    const reference = lens === 'value' ? row.invested : 0
    return Number(yAxis.scale(Math.min(Math.max(reference, domain[0]), domain[1])))
  }
  // Same curves as the Recharts lines (monotone value, stepAfter money in), so the edges meet them.
  const upper = line<ChartRow>().x(x).y(top).curve(curveMonotoneX)(rows)
  const reference = line<ChartRow>().x(x).y(bottom).curve(curveStepAfter)(rows)
  const lowerBack = line<ChartRow>().x(x).y(bottom).curve(curveStepBefore)([...rows].reverse())
  if (!upper || !reference || !lowerBack) return null

  const left = x(rows[0])
  const right = x(rows[rows.length - 1])
  const band = `${upper}L${lowerBack.slice(1)}Z`
  return (
    <g pointerEvents="none">
      <defs>
        <clipPath id={`${id}-gain`}><path d={`${reference}L${right},${plot.y}L${left},${plot.y}Z`} /></clipPath>
        <clipPath id={`${id}-loss`}><path d={`${reference}L${right},${plot.y + plot.height}L${left},${plot.y + plot.height}Z`} /></clipPath>
      </defs>
      <path d={band} fill="var(--color-gain)" fillOpacity={0.14} clipPath={`url(#${id}-gain)`} />
      <path d={band} fill="var(--color-loss)" fillOpacity={0.14} clipPath={`url(#${id}-loss)`} />
    </g>
  )
}

/**
 * Journal entries along the bottom of the plot, stacked per point. Reflections arc back to the
 * entry they reflect on. Hovering a point lights its entries and their sources.
 */
function JournalLane({ rows, onEntryClick }: { rows: ChartRow[]; onEntryClick?: (entry: JournalEntry) => void }) {
  const xAxis = useXAxis(0)
  const plot = usePlotArea()
  const active = useActiveTooltipDataPoints<ChartRow>()?.[0]

  const layout = useMemo(() => {
    if (!xAxis || !plot) return null
    const base = plot.y + plot.height - 22
    const marks: { entry: JournalEntry; x: number; y: number }[] = []
    const positions = new Map<number, number>()
    for (const row of rows) {
      const x = Number(xAxis.scale(row.x))
      row.entries.slice(0, MAX_MARKS).forEach((entry, k) => {
        marks.push({ entry, x, y: base - k * MARK_SPACING })
        positions.set(entry.id, x)
      })
    }
    const arcs = marks.flatMap(({ entry, x }) => {
      const from = entry.sourceEntryId != null ? positions.get(entry.sourceEntryId) : undefined
      return from === undefined ? [] : [{ id: entry.id, from, to: x }]
    })
    return { base, marks, arcs }
  }, [rows, xAxis, plot])

  if (!layout) return null

  const lit = new Set<number>()
  for (const entry of active?.entries ?? []) {
    lit.add(entry.id)
    if (entry.sourceEntryId != null) lit.add(entry.sourceEntryId)
  }
  const open = (entry: JournalEntry) => onEntryClick?.(entry)
  const onKey = (entry: JournalEntry) => (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    open(entry)
  }
  const arcY = layout.base + 5

  return (
    <g>
      {layout.arcs.map(({ id, from, to }) => {
        const on = lit.has(id)
        const depth = Math.min(16, Math.abs(to - from) * 0.25 + 4)
        return (
          <path
            key={id}
            d={`M${from},${arcY}C${from},${arcY + depth} ${to},${arcY + depth} ${to},${arcY}`}
            fill="none"
            stroke="var(--color-reflection)"
            strokeOpacity={on ? 0.9 : 0.3}
            strokeWidth={on ? 1.5 : 1}
            pointerEvents="none"
          />
        )
      })}
      {layout.marks.map(({ entry, x, y }) => {
        const on = lit.has(entry.id)
        const style = JOURNAL_STYLES[entry.entryType]
        return (
          <g key={entry.id}>
            <circle
              cx={x}
              cy={y}
              r={on ? 5.5 : 4}
              fill={style.color}
              stroke="var(--color-surface)"
              strokeWidth={2}
              opacity={lit.size > 0 && !on ? 0.45 : 1}
              pointerEvents="none"
            />
            {onEntryClick && (
              <circle
                cx={x}
                cy={y}
                r={9}
                fill="transparent"
                strokeWidth={2}
                role="button"
                tabIndex={0}
                aria-label={`Open ${style.label.toLowerCase()} entry${entry.ticker ? ` for ${entry.ticker}` : ''}, ${formatMarketDay(marketDay(entry.timestamp))}`}
                className="cursor-pointer outline-none focus-visible:stroke-primary pointer-coarse:[r:14px]"
                onClick={(event) => {
                  event.stopPropagation()
                  open(entry)
                }}
                onKeyDown={onKey(entry)}
              />
            )}
          </g>
        )
      })}
    </g>
  )
}

function PerformanceTooltip({ active, payload, lens, resolution, entriesById }: {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: ChartRow }>
  lens: PerformanceLens
  resolution: Resolution
  entriesById: Map<number, JournalEntry>
}) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  const gain = lens === 'gain' ? row.gain : row.value - row.invested
  return (
    <div className={`${GLASS_TOOLTIP_CLASS} w-64 px-3 py-2 text-sm text-foreground`}>
      <div className="text-muted mb-1">{formatRowLabel(row, resolution)}</div>
      <div className="flex justify-between tabular-nums">
        <span className="text-secondary">Value</span>
        <span>{formatCurrency(row.value)}</span>
      </div>
      <div className="flex justify-between tabular-nums">
        <span className="text-secondary">Gain</span>
        <span className={signTone(gain)}>{formatSignedCurrency(gain)}</span>
      </div>
      {row.trades.length > 0 && (
        <div className="mt-2 border-t border-border-subtle pt-2 text-secondary">
          {tradeLines(row.trades).map(text => <div key={text}>{text}</div>)}
        </div>
      )}
      {row.entries.slice(0, 2).map(entry => {
        const source = entry.sourceEntryId != null ? entriesById.get(entry.sourceEntryId) : undefined
        return (
          <div key={entry.id} className="mt-2 border-t border-border-subtle pt-2">
            <div className="flex items-center gap-2">
              <span className={journalBadge(entry.entryType)}>{JOURNAL_STYLES[entry.entryType].label}</span>
              {entry.ticker && <span className="font-130">{entry.ticker}</span>}
            </div>
            <p className="mt-1 line-clamp-3 text-secondary">{getDisplayBody(entry.body)}</p>
            {source && (
              <div className="mt-1 text-xs text-muted">
                Reflects on {JOURNAL_STYLES[source.entryType].label}{source.ticker ? ` · ${source.ticker}` : ''}, {formatMarketDay(marketDay(source.timestamp))}
              </div>
            )}
          </div>
        )
      })}
      {row.entries.length > 2 && <div className="mt-1 text-xs text-muted">+{row.entries.length - 2} more</div>}
    </div>
  )
}

/** Picks a span of market dates in place of a range, prefilled with the dates on screen. */
function ChartDatePicker({ dates, shown, bounds, onChange }: {
  dates: DateWindow | null
  shown: DateWindow
  bounds: DateWindow
  onChange: (dates: DateWindow | null) => void
}) {
  const value = dates ?? shown
  const pick = (edge: keyof DateWindow, day: string) => {
    if (!day) return
    const next = { ...value, [edge]: day }
    onChange(next.from <= next.to ? next : { from: next.to, to: next.from })
  }
  const field = (edge: keyof DateWindow, label: string, min: string, max: string) => (
    <label className="block">
      <span className="text-xs text-muted block mb-1">{label}</span>
      <input
        type="date"
        value={value[edge]}
        min={min}
        max={max}
        onChange={(event) => pick(edge, event.target.value)}
        className="w-full bg-foreground/5 border border-border-control rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
  )
  return (
    <div className="flex rounded-md bg-foreground/5 p-0.5">
      <SettingsPopover
        label="Choose dates"
        glass
        width={224}
        triggerClassName={`px-1.5! py-1! ${dates ? 'bg-primary/15 text-foreground' : 'text-secondary hover:text-foreground'}`}
        trigger={<CalendarIcon className="w-4 h-4" />}
      >
        <div className="space-y-2 p-1">
          {field('from', 'From', bounds.from, value.to)}
          {field('to', 'To', value.from, bounds.to)}
          <div className="flex justify-end">
            <button type="button" onClick={() => onChange(null)} className="text-xs text-primary hover:text-primary-hover">
              Clear
            </button>
          </div>
        </div>
      </SettingsPopover>
    </div>
  )
}

const EMPTY_ENTRIES: JournalEntry[] = []
const EMPTY_HISTORY: HistoryPoint[] = []
const EMPTY_TRANSACTIONS: Transaction[] = []

const PortfolioChart = forwardRef<PortfolioChartHandle, Props>(function PortfolioChart({ onEntryClick }, ref) {
  const historyQuery = useQuery(portfolioQueries.history())
  const transactionsQuery = useQuery(portfolioQueries.transactions())
  const journalQuery = useQuery(journalQueries.entries())
  const history = historyQuery.data ?? EMPTY_HISTORY
  const transactions = transactionsQuery.data ?? EMPTY_TRANSACTIONS
  const journalEntries = journalQuery.data ?? EMPTY_ENTRIES
  const loading = historyQuery.isPending || transactionsQuery.isPending
  const error = historyQuery.error?.message ?? transactionsQuery.error?.message ?? journalQuery.error?.message
  const { chartRange: [range, setRange], chartLens: [lens, setLens], chartDates: [dates, setDates] } = useViewState()
  const containerRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    showDay: (date: Date) => {
      const day = marketDay(date)
      setDates({ from: day, to: day })
    },
    scrollIntoView: () => {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
  }), [setDates])

  // Each stage recomputes only when its inputs change: switching range or lens never rebuilds the timeline.
  const timeline = useMemo(() => buildTimeline(history, transactions), [history, transactions])
  const closes = useMemo(() => dailyCloses(timeline), [timeline])
  const datedEntries = useMemo(() => dateEntries(journalEntries), [journalEntries])
  const entriesById = useMemo(() => new Map(journalEntries.map(entry => [entry.id, entry])), [journalEntries])
  const { rows, resolution } = useMemo(() => {
    const { points, baseline, resolution } = dates ? selectDates(timeline, closes, dates) : selectRange(timeline, closes, range)
    return { rows: toRows(points, baseline, datedEntries, resolution), resolution }
  }, [timeline, closes, range, dates, datedEntries])
  const domain = useMemo<[number, number]>(() => rows.length === 0 ? [0, 1] : lens === 'value'
    ? yDomain(rows.map(row => row.value), rows.map(row => row.invested))
    : yDomain(rows.map(row => row.gain), [0]), [rows, lens])
  const axis = useMemo(() => axisTicks(rows, resolution), [rows, resolution])
  const yTicks = useMemo(() => ticks(domain[0], domain[1], 4), [domain])
  // Money in only shows when it fits beside the value line; on short ranges it would flatten the line,
  // and a gap clamped to the plot's edge would no longer mean gain.
  const showMoneyIn = lens === 'value' && rows.every(row => row.invested >= domain[0] && row.invested <= domain[1])
  const openActiveEntry = useCallback((state: { activeTooltipIndex?: number | string | null }) => {
    const entry = rows[Number(state.activeTooltipIndex)]?.entries[0]
    if (entry) onEntryClick?.(entry)
  }, [rows, onEntryClick])

  if (loading && !error) {
    return (
      <div className="h-72 flex items-center justify-center bg-surface rounded-lg border border-border">
        <span className="text-muted">Loading chart...</span>
      </div>
    )
  }

  if (error && (!historyQuery.data || !transactionsQuery.data)) {
    return (
      <div className="h-72 flex items-center justify-center bg-surface rounded-lg border border-border text-error">
        {error}
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center bg-surface rounded-lg border border-border text-muted">
        {error || 'No historical data available'}
      </div>
    )
  }

  const bounds = { from: timeline[0].day, to: timeline[timeline.length - 1].day }
  const last = rows[rows.length - 1]
  const lineColor = !last || last.gain >= 0 ? 'var(--color-gain)' : 'var(--color-loss)'
  const label = dates ? `${lens === 'value' ? 'Portfolio value' : 'Gain'}, ${formatDateWindow(dates)}`
    : lens === 'value' ? 'Portfolio value'
    : range !== '1D' ? GAIN_LABELS[range]
    : bounds.to === marketDay(Date.now()) ? 'Gain today' : `Gain, ${formatMarketDay(bounds.to)}`
  const headline = !last ? '—' : lens === 'value' ? formatCurrency(last.value) : formatSignedCurrency(last.gain)

  return (
    <div ref={containerRef} className="bg-surface p-4 md:p-5 rounded-lg border border-border">
      {error && <div className="text-error mb-4">{error}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-sm text-muted">{label}</div>
          <div className={`text-2xl md:text-3xl font-130 tabular-nums ${lens === 'gain' && last ? signTone(last.gain) : 'text-foreground'}`}>
            {headline}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl label="Chart measure" options={LENSES} value={lens} onChange={setLens} />
          <SegmentedControl label="Chart period" options={RANGES} value={dates ? null : range} onChange={(next) => {
            setRange(next)
            setDates(null)
          }} />
          <ChartDatePicker
            dates={dates}
            shown={last ? { from: rows[0].day, to: last.day } : bounds}
            bounds={bounds}
            onChange={setDates}
          />
        </div>
      </div>

      {rows.length > 0 ? (
        <div onPointerMove={trackTooltipDrift} className="h-72 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} onClick={openActiveEntry}>
              <CartesianGrid vertical={false} syncWithTicks strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
              <XAxis
                dataKey="x"
                type="number"
                domain={['dataMin', 'dataMax']}
                ticks={axis.ticks}
                interval={0}
                tickFormatter={(value) => axis.labels.get(value) ?? ''}
                padding={{ left: 12, right: 12 }}
                stroke="var(--color-muted)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={domain}
                allowDataOverflow
                padding={{ bottom: LANE_HEIGHT }}
                ticks={yTicks}
                interval={0}
                tickFormatter={(value: number) => lens === 'gain' && value > 0 ? `+${formatCompactCurrency(value)}` : formatCompactCurrency(value)}
                stroke="var(--color-muted)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                width={64}
              />
              {lens === 'gain' && domain[0] <= 0 && domain[1] >= 0 && <ReferenceLine y={0} stroke="var(--color-border)" />}
              {(lens === 'gain' || showMoneyIn) && <Customized component={<GainBand rows={rows} lens={lens} domain={domain} />} />}
              {showMoneyIn && (
                <Line
                  dataKey="invested"
                  name="Money in"
                  type="stepAfter"
                  stroke="var(--color-border-control)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              )}
              <Line
                dataKey={lens}
                type="monotone"
                stroke={lineColor}
                strokeWidth={2}
                dot={rows.length === 1}
                activeDot={{ r: 4, strokeWidth: 0, fill: lineColor }}
                isAnimationActive={false}
              />
              <Customized component={<JournalLane rows={rows} onEntryClick={onEntryClick} />} />
              <Tooltip
                {...GLIDING_TOOLTIP}
                cursor={{ stroke: 'var(--color-muted)', strokeOpacity: 0.4 }}
                content={<PerformanceTooltip lens={lens} resolution={resolution} entriesById={entriesById} />}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-72 md:h-80 flex items-center justify-center bg-surface-hover rounded-lg text-muted">
          {dates && dates.from !== dates.to ? 'No data for these dates' : 'No data for this day'}
        </div>
      )}
    </div>
  )
})

export default PortfolioChart
