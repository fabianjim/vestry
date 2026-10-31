import { useMemo, type ReactElement, type ReactNode } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  Bar, BarChart, Cell, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, XAxis, YAxis,
} from 'recharts'
import type { Behavior } from '../../types/insights'
import { portfolioQueries, stockQueries } from '../../services/queries'
import {
  chartTickers, groupTrades, portfolioChart, priceChart, riskChart, visualFor, type PriceChart, type TradeMark,
} from '../../utils/insightCharts'
import { signedMoney, signedPercent, type Month } from '../../utils/insights'
import { formatCompactCurrency } from '../../utils/formatUtils'

type Props = { behavior: Behavior; months: Month[] }

// Lines stay achromatic; the accent marks decisions, and green and red only mean gains and losses.
const LINES = [
  { stroke: 'var(--color-foreground)', dash: undefined },
  { stroke: 'var(--color-secondary)', dash: '6 3' },
  { stroke: 'var(--color-muted)', dash: '2 3' },
]
const AXIS = { fill: 'var(--color-muted)', fontSize: 11 }
// the plot ends this far from the right, where the value axis sits; the evidence strip leaves the same room
export const AXIS_WIDTH = 44

// axis labels fit the narrow axis: $40k, $2.5k, $950
const axisMoney = (v: number) => {
  const abs = Math.abs(v)
  const text = abs >= 1000 ? `$${+(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k` : `$${Math.round(abs)}`
  return v < 0 ? `−${text}` : text
}

const shortDay = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
const tradeLabel = (mark: TradeMark) =>
  `${shortDay.format(Date.parse(mark.date))}: ${mark.side === 'BUY' ? 'bought' : 'sold'} ${+mark.shares.toFixed(4)} ${mark.ticker} at ${formatCompactCurrency(mark.price)}`

// ▲ for a buy, ▼ for a sale, sized by amount where that's the point
function TradeShape(props: unknown) {
  const { cx, cy, payload } = props as { cx?: number; cy?: number; payload?: TradeMark }
  if (cx == null || cy == null || !payload) return <g />
  const r = 4 + payload.size * 5
  const points = payload.side === 'BUY'
    ? `${cx},${cy - r} ${cx - r},${cy + r * 0.8} ${cx + r},${cy + r * 0.8}`
    : `${cx},${cy + r} ${cx - r},${cy - r * 0.8} ${cx + r},${cy - r * 0.8}`
  return (
    <polygon points={points} fill={payload.side === 'BUY' ? 'var(--color-primary)' : 'var(--color-background)'}
      stroke="var(--color-primary)" strokeWidth={1.5}>
      <title>{tradeLabel(payload)}</title>
    </polygon>
  )
}

/** Thin month dividers, at the same places as the evidence strip's. */
function monthLines(months: Month[]) {
  return months.slice(1).map((m, i) => (
    <ReferenceLine key={m.key} x={(i + 1) / months.length} stroke="var(--color-border-subtle)" ifOverflow="hidden" />
  ))
}

export default function BehaviorVisual({ behavior, months }: Props) {
  const visual = visualFor(behavior.kind)
  const trades = useMemo(() => groupTrades(behavior), [behavior])
  const tickers = visual === 'prices' ? chartTickers(trades) : visual === 'risk' ? [...new Set(trades.map(t => t.ticker))] : []
  const histories = useQueries({
    queries: tickers.map(ticker => ({ ...stockQueries.history(ticker), staleTime: 5 * 60_000 })),
    combine: results => Object.fromEntries(tickers.map((ticker, i) => [ticker, results[i].data])),
  })
  const portfolio = useQuery({ ...portfolioQueries.history(), enabled: visual === 'portfolio' })
  const holdings = useQuery({ ...portfolioQueries.holdings(), enabled: visual === 'risk' })

  if (!visual || !months.length) return null
  const figures = new Map(behavior.figures.map(f => [f.key, f.value]))

  if (visual === 'prices') {
    const chart = priceChart(behavior, histories, months)
    if (!chart) return null
    return <Prices chart={chart} kind={behavior.kind} months={months} runUp={figures.get('median_run_up')} />
  }

  if (visual === 'portfolio') {
    const chart = portfolioChart(behavior, portfolio.data, months, behavior.kind === 'position_sizing')
    if (!chart) return null
    return (
      <Frame caption={`Portfolio value, with these trades marked${behavior.kind === 'position_sizing' ? ', sized by amount' : ''}`}
        legend={<TradeLegend marks={chart.marks} />}>
        <ComposedChart margin={{ top: 12, right: 0, bottom: 4, left: 0 }}>
          <XAxis type="number" dataKey="x" domain={[0, 1]} hide />
          <YAxis type="number" dataKey="y" domain={['auto', 'auto']} orientation="right" width={AXIS_WIDTH} tickCount={3} axisLine={false} tickLine={false}
            tick={AXIS} tickFormatter={axisMoney} />
          {monthLines(months)}
          <Line data={chart.points} dataKey="y" type="monotone" dot={false} stroke={LINES[0].stroke} strokeWidth={1.5} isAnimationActive={false} />
          <Scatter data={chart.marks} dataKey="y" shape={TradeShape} isAnimationActive={false} />
        </ComposedChart>
      </Frame>
    )
  }

  const chart = riskChart(behavior, histories, holdings.data, months, figures.get('possible_monthly_loss'))
  if (!chart) return null
  return (
    <Frame caption="Each month’s move at today’s size, against a bad month (about 1 in 20)"
      legend={<span className="inline-flex items-center gap-1.5"><Dash /> {signedMoney(-chart.badMonth)}</span>}>
      <BarChart data={chart.bars} margin={{ top: 12, right: 0, bottom: 4, left: 0 }} barCategoryGap="35%">
        <XAxis dataKey="key" hide padding={{ left: 0, right: 0 }} />
        <YAxis domain={[(min: number) => Math.min(min, -chart.badMonth) * 1.15, 'auto']} orientation="right" width={AXIS_WIDTH} tickCount={3}
          axisLine={false} tickLine={false} tick={AXIS} tickFormatter={axisMoney} />
        <ReferenceLine y={0} stroke="var(--color-border)" />
        <ReferenceLine y={-chart.badMonth} stroke="var(--color-muted)" strokeDasharray="4 4" />
        <Bar dataKey="move" isAnimationActive={false} radius={[2, 2, 2, 2]}>
          {chart.bars.map(bar => (
            <Cell key={bar.key}
              fill={bar.move == null ? 'transparent' : bar.move < 0 ? (bar.worse ? 'var(--color-loss-emphasis)' : 'var(--color-loss)') : 'var(--color-gain)'}
              fillOpacity={bar.worse ? 1 : 0.7}>
              <title>{bar.move == null ? `${bar.label}: no price stored` : `${bar.label}: ${signedMoney(bar.move)}`}</title>
            </Cell>
          ))}
        </Bar>
      </BarChart>
    </Frame>
  )
}

function Prices({ chart, kind, months, runUp }: { chart: PriceChart; kind: string; months: Month[]; runUp?: number }) {
  const single = chart.unit === 'price'
  const shown = single ? `${chart.series[0].ticker} price, with these decisions marked` : 'Change since your first decision in each'
  const caption = chart.hidden > 0 ? `${shown}; the ${chart.series.length} most traded of ${chart.series.length + chart.hidden} tickers` : shown
  const note = (kind === 'run_up' || kind === 'hype') && runUp != null
    ? `Prices start at your first buy. Before buying, these rose ${signedPercent(runUp)} at the median.` : null
  return (
    <Frame caption={caption} note={note} legend={
      <>
        {!single && chart.series.map(({ ticker }, i) => (
          <span key={ticker} className="inline-flex items-center gap-1.5"><Swatch index={i} /> {ticker}</span>
        ))}
        <TradeLegend marks={chart.marks} />
        {chart.spans.some(s => s.gain) && <span className="inline-flex items-center gap-1.5"><Area gain /> Held to a gain</span>}
        {chart.spans.some(s => !s.gain) && <span className="inline-flex items-center gap-1.5"><Area gain={false} /> Held to a loss</span>}
      </>
    }>
      <ComposedChart margin={{ top: 12, right: 0, bottom: 4, left: 0 }}>
        <XAxis type="number" dataKey="x" domain={[0, 1]} hide />
        <YAxis type="number" dataKey="y" domain={['auto', 'auto']} orientation="right" width={AXIS_WIDTH} tickCount={3} axisLine={false} tickLine={false}
          tick={AXIS} tickFormatter={(v: number) => (single ? axisMoney(v) : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 100)}%`)} />
        {monthLines(months)}
        {chart.spans.map(span => (
          <ReferenceArea key={`${span.ticker}-${span.x1}`} x1={span.x1} x2={span.x2} ifOverflow="hidden"
            fill={span.gain ? 'var(--color-gain)' : 'var(--color-loss)'} fillOpacity={0.12} />
        ))}
        {!single && <ReferenceLine y={0} stroke="var(--color-border)" strokeDasharray="3 3" />}
        {chart.series.map(({ ticker, points }, i) => (
          <Line key={ticker} data={points} dataKey="y" type="monotone" dot={false} isAnimationActive={false}
            stroke={LINES[i].stroke} strokeDasharray={LINES[i].dash} strokeWidth={1.5} />
        ))}
        <Scatter data={chart.marks} dataKey="y" shape={TradeShape} isAnimationActive={false} />
      </ComposedChart>
    </Frame>
  )
}

function Frame({ caption, note, legend, children }: { caption: string; note?: string | null; legend?: ReactNode; children: ReactElement }) {
  return (
    // fills the height the card has left, so a card with more text gets a shorter chart instead of scrolling
    <figure className="mt-2 flex min-h-0 flex-1 flex-col">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-xs text-muted">
        <span>{caption}</span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">{legend}</span>
      </figcaption>
      {/* absolute, because a flexible box gives percentage heights nothing to resolve against */}
      <div className="relative mt-1 min-h-[96px] max-h-[280px] flex-1">
        <div className="absolute inset-0">
          <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
        </div>
      </div>
      {note && <p className="text-xs text-muted">{note}</p>}
    </figure>
  )
}

function TradeLegend({ marks }: { marks: TradeMark[] }) {
  return (
    <>
      {marks.some(m => m.side === 'BUY') && <span className="inline-flex items-center gap-1.5"><Triangle /> Bought</span>}
      {marks.some(m => m.side === 'SELL') && <span className="inline-flex items-center gap-1.5"><Triangle down /> Sold</span>}
    </>
  )
}

const Triangle = ({ down = false }: { down?: boolean }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <polygon points={down ? '5,9 1,2 9,2' : '5,1 1,8 9,8'} fill={down ? 'var(--color-background)' : 'var(--color-primary)'}
      stroke="var(--color-primary)" strokeWidth="1.2" />
  </svg>
)
const Swatch = ({ index }: { index: number }) => (
  <svg width="16" height="6" aria-hidden="true">
    <line x1="0" y1="3" x2="16" y2="3" stroke={LINES[index].stroke} strokeDasharray={LINES[index].dash} strokeWidth="1.5" />
  </svg>
)
const Dash = () => (
  <svg width="16" height="6" aria-hidden="true"><line x1="0" y1="3" x2="16" y2="3" stroke="var(--color-muted)" strokeDasharray="4 4" strokeWidth="1.5" /></svg>
)
const Area = ({ gain }: { gain: boolean }) => (
  <span aria-hidden="true" className={`inline-block size-2.5 rounded-sm ${gain ? 'bg-gain/25' : 'bg-loss/25'}`} />
)
