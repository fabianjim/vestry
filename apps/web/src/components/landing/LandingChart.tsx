import { useEffect, useId, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Customized } from 'recharts'
import { usePlotArea, useXAxis, useYAxis } from 'recharts/es6/hooks'
import { curveMonotoneX, line } from 'd3'
import { JOURNAL_STYLES, journalBadge } from '../../constants/journalStyles'
import { useHeroPlayback } from '../../hooks/useHeroPlayback'
import { buildHeroTimeline, valueAtTime, type HeroFrame } from '../../utils/heroTimeline'
import { roundToMinute } from '../../utils/dateUtils'
import { formatCompactCurrency } from '../../utils/formatUtils'
import LandingEntryCard from './LandingEntryCard'
import StackItem from '../StackItem'
import { HERO_EVENTS, PORTFOLIO_AXIS_TICKS, PORTFOLIO_DAY, type PortfolioPoint } from './landingStory'

interface LandingChartProps {
  onBuyClick?: () => void
}

const TIMELINE = buildHeroTimeline(
  PORTFOLIO_DAY[0].time,
  PORTFOLIO_DAY[PORTFOLIO_DAY.length - 1].time,
  HERO_EVENTS.map(event => ({ time: event.time, chars: event.entry.body.length })),
)
const BUY_INDEX = HERO_EVENTS.findIndex(event => event.entry.entryType === 'BUY')
// Newest on top, so each new card pushes the earlier ones down.
const STACK = HERO_EVENTS.map((event, index) => ({ ...event, index })).reverse()

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

type OverlayProps = {
  subscribe: (listener: (frame: HeroFrame) => void) => () => void
  visible: number
  done: boolean
  pulse: boolean
  onBuyClick: () => void
}

/** Draws the portfolio line revealed up to the playhead, plus event markers. Rendered by Recharts' Customized. */
function PlaybackOverlay({ subscribe, visible, done, pulse, onBuyClick }: OverlayProps) {
  const xAxis = useXAxis(0)
  const yAxis = useYAxis(0)
  const plot = usePlotArea()
  const clip = useRef<SVGRectElement>(null)
  const clipId = `hero-reveal-${useId().replace(/:/g, '')}`

  useEffect(() => {
    if (!xAxis || !plot) return
    return subscribe(frame => {
      clip.current?.setAttribute('width', String(Math.max(0, Number(xAxis.scale(frame.revealTime)) - plot.x)))
    })
  }, [subscribe, xAxis, plot])

  if (!xAxis || !yAxis || !plot) return null
  const x = (time: number) => Number(xAxis.scale(time))
  const y = (value: number) => Number(yAxis.scale(value))
  const path = line<PortfolioPoint>().x(point => x(point.time)).y(point => y(point.value)).curve(curveMonotoneX)(PORTFOLIO_DAY)

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect ref={clip} x={plot.x} y={plot.y - 8} width={0} height={plot.height + 16} />
        </clipPath>
      </defs>
      <path d={path ?? undefined} fill="none" stroke="var(--color-gain)" strokeWidth={2} clipPath={`url(#${clipId})`} />
      {HERO_EVENTS.map((event, index) => {
        const cx = x(event.time)
        const cy = y(event.value)
        const type = event.entry.entryType
        const isBuy = index === BUY_INDEX
        const shown = visible > index
        return (
          <g
            key={event.entry.id}
            className={`transition-opacity duration-300 motion-reduce:transition-none ${shown ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            <circle cx={cx} cy={cy} r={isBuy ? 6 : 4} fill={JOURNAL_STYLES[type].color} stroke="var(--color-surface)" strokeWidth={2} />
            {/* Buy sits below-left of the close, where the line never runs. */}
            <foreignObject x={isBuy ? cx - 72 : cx - 40} y={cy + 12} width={isBuy ? 72 : 80} height={28}>
              <div className={`flex h-full items-start ${isBuy ? 'justify-end' : 'justify-center'}`}>
                {isBuy ? (
                  <button
                    type="button"
                    disabled={!done}
                    onClick={onBuyClick}
                    aria-label={`Open the ${event.entry.ticker} buy entry`}
                    className={`${journalBadge(type)} cursor-pointer hover:border-buy disabled:cursor-default ${pulse ? 'motion-safe:animate-pulse' : ''}`}
                  >
                    {JOURNAL_STYLES[type].label}
                  </button>
                ) : (
                  <span className={journalBadge(type)}>{JOURNAL_STYLES[type].label}</span>
                )}
              </div>
            </foreignObject>
          </g>
        )
      })}
    </g>
  )
}

function TypedBody({ text, count }: { text: string; count: number }) {
  return (
    <span className="grid">
      {/* The full text reserves the card's final height so typing never reflows the stack. */}
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">{text}</span>
      <span aria-hidden="true" className="col-start-1 row-start-1">
        {text.slice(0, count)}
        {count < text.length && <span className="ml-px inline-block h-[1em] w-px translate-y-[0.15em] bg-foreground" />}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  )
}

export default function LandingChart({ onBuyClick }: LandingChartProps) {
  const { frame, subscribe } = useHeroPlayback(TIMELINE)
  const [clicked, setClicked] = useState(false)
  const total = useRef<HTMLDivElement>(null)
  const pulse = frame.done && !clicked
  const newest = frame.visible - 1

  useEffect(() => subscribe(next => {
    if (total.current) total.current.textContent = formatCompactCurrency(valueAtTime(PORTFOLIO_DAY, next.revealTime))
  }), [subscribe])

  const openBuy = () => {
    setClicked(true)
    onBuyClick?.()
  }

  return (
    <div className="relative w-full max-w-3xl mx-auto min-[1200px]:max-w-[min(48rem,calc(100vw_-_46rem))]">
      <div
        role="figure"
        aria-label="Portfolio value through one trading day, with a sell, an insight and a buy recorded along the way"
        className="bg-surface p-6 rounded-lg border border-border hover:border-primary/30 transition-colors"
      >
        <div className="mb-4">
          <span className="text-xs font-130 uppercase text-muted tracking-wide">Portfolio Value</span>
          <div ref={total} className="text-2xl font-130 text-foreground mt-1 tabular-nums" />
        </div>

        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={PORTFOLIO_DAY} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
              <XAxis
                dataKey="time"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                ticks={PORTFOLIO_AXIS_TICKS}
                tickFormatter={formatTime}
                stroke="var(--color-muted)"
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border-subtle)' }}
              />
              <YAxis
                stroke="var(--color-muted)"
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border-subtle)' }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                domain={['dataMin - 1000', 'dataMax + 1000']}
              />
              <Tooltip active={frame.done ? undefined : false} content={({ active, payload, label }) => active && payload?.length ? (
                <div className="rounded-md border border-border bg-elevated px-3 py-2 text-sm text-foreground">
                  {formatTime(Number(label))}: {formatCompactCurrency(Number(payload[0].value))}
                </div>
              ) : null} />
              {/* Invisible series: keeps the axis domain and tooltip; the overlay draws the visible line. */}
              <Line
                type="monotone"
                dataKey="value"
                stroke="transparent"
                dot={false}
                activeDot={frame.done ? { r: 4, strokeWidth: 0, fill: 'var(--color-gain)' } : false}
                isAnimationActive={false}
              />
              <Customized component={
                <PlaybackOverlay subscribe={subscribe} visible={frame.visible} done={frame.done} pulse={pulse} onBuyClick={openBuy} />
              } />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div
        className="mt-4 min-[1200px]:mt-0 min-[1200px]:absolute min-[1200px]:left-full min-[1200px]:top-0 min-[1200px]:ml-6 min-[1200px]:w-80"
      >
        {STACK.map(({ entry, index }) => (
          <StackItem key={entry.id} show={frame.visible > index}>
            <LandingEntryCard
              entry={entry}
              time={roundToMinute(entry.timestamp)}
              body={<TypedBody text={entry.body} count={frame.typed[index]} />}
              narrowCompact={index < newest}
              pulse={index === BUY_INDEX && pulse}
              onActivate={index === BUY_INDEX && frame.done ? openBuy : undefined}
            />
          </StackItem>
        ))}
      </div>
    </div>
  )
}
