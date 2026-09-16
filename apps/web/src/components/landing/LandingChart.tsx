import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Customized } from 'recharts'
import { useXAxis, useYAxis } from 'recharts/es6/hooks'

interface DataPoint {
  time: number
  label: string
  value: number
}

interface LandingChartProps {
  onBuyClick?: () => void
}

const BASE_DATE = new Date(2024, 0, 1)

function parseTime(timeStr: string): number {
  const [time, modifier] = timeStr.split(' ')
  const parts = time.split(':').map(Number)
  let hours = parts[0]
  const minutes = parts[1] ?? 0
  if (modifier === 'PM' && hours !== 12) hours += 12
  if (modifier === 'AM' && hours === 12) hours = 0
  const date = new Date(BASE_DATE)
  date.setHours(hours, minutes, 0, 0)
  return date.getTime()
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

const rawData = [
  { time: '10 AM', value: 46000 },
  { time: '11 AM', value: 47400 },
  { time: '11:35 AM', value: 49000 },
  { time: '12 PM', value: 46400 },
  { time: '1 PM', value: 43900 },
  { time: '1:45 PM', value: 46200 },
  { time: '2 PM', value: 47400 },
  { time: '3 PM', value: 45800 },
  { time: '3:50 PM', value: 45250 },
]

const data: DataPoint[] = rawData.map((d) => ({
  time: parseTime(d.time),
  label: d.time,
  value: d.value,
}))

const BUY_COLOR = 'var(--color-buy)'
const SELL_COLOR = 'var(--color-sell)'
const INSIGHT_COLOR = 'var(--color-insight)'

const xAxisTicks = rawData
  .filter((d) => ['10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '3:50 PM'].includes(d.time))
  .map((d) => parseTime(d.time))

const events = [
  { time: parseTime('11:35 AM'), value: 49000, type: 'SELL', color: SELL_COLOR, label: 'Sell' },
  { time: parseTime('1:45 PM'), value: 46200, type: 'INSIGHT', color: INSIGHT_COLOR, label: 'Insight' },
  { time: parseTime('3:50 PM'), value: 45250, type: 'BUY', color: BUY_COLOR, label: 'BUY' },
]

function EventOverlay({ onBuyClick, buyClicked }: { onBuyClick?: () => void; buyClicked?: boolean }) {
  const xAxis = useXAxis(0)
  const yAxis = useYAxis(0)

  if (!xAxis || !yAxis) return null

  return (
    <g>
      {events.map((event) => {
        const cx = xAxis.scale(event.time)
        const cy = yAxis.scale(event.value)
        const isBuy = event.type === 'BUY'

        return (
          <g key={event.type}>
            <circle
              cx={cx}
              cy={cy}
              r={isBuy ? 10 : 4}
              fill={event.color}
              stroke="var(--color-surface)"
              strokeWidth={2}
              className={isBuy && !buyClicked ? 'animate-pulse' : undefined}
              style={{ cursor: isBuy ? 'pointer' : 'default' }}
              onClick={isBuy ? onBuyClick : undefined}
            />
            <foreignObject
              x={isBuy ? cx - 52: cx - 40}
              y={isBuy ? cy - 48 : cy + 12}
              width="72"
              height="32"
            >
              {isBuy ? (
                <button
                  onClick={onBuyClick}
                  className={`inline-flex items-center justify-center gap-1.5 w-full h-full px-2 bg-buy-soft border border-buy-border text-buy rounded-md text-xs font-130 uppercase tracking-wide hover:bg-surface-hover active:bg-surface-active transition-colors cursor-pointer${buyClicked ? '' : ' animate-pulse'}`}
                >
                  <span className="w-2 h-2 rounded-full bg-gain" />
                  BUY
                </button>
              ) : ( // sell, insight events
                <div className="inline-flex items-center justify-center gap-1.5 w-11/12 h-11/12 px-1 bg-surface border border-border text-foreground rounded-md text-[11px] font-130 uppercase tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: event.color }} />
                  {event.label}
                </div>
              )}
            </foreignObject>
          </g>
        )
      })}
    </g>
  )
}

export default function LandingChart({ onBuyClick }: LandingChartProps) {
  const [buyClicked, setBuyClicked] = useState(false)

  const handleBuyClick = () => {
    setBuyClicked(true)
    onBuyClick?.()
  }

  return (
    <div className="w-full max-w-3xl mx-auto bg-surface p-6 rounded-lg border border-border hover:border-primary/30 transition-colors">
      <div className="mb-4">
        <span className="text-xs font-130 uppercase text-muted tracking-wide">Portfolio Value</span>
        <div className="text-2xl font-130 text-foreground mt-1">$45,250</div>
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
            <XAxis
              dataKey="time"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              ticks={xAxisTicks}
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
            <Tooltip
              formatter={(value: number) => [`$${value.toLocaleString()}`, 'Value']}
              labelFormatter={(label) => formatTime(label as number)}
              contentStyle={{
                backgroundColor: 'var(--color-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                color: 'var(--color-foreground)',
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-gain)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={true}
              animationDuration={1000}
            />
            <Customized component={() => <EventOverlay onBuyClick={handleBuyClick} buyClicked={buyClicked} />} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
