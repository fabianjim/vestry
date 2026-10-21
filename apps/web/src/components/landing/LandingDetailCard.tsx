import { journalBadge } from '../../constants/journalStyles'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts'

import { formatCompactCurrency, formatCurrency, formatSignedCurrencyWithPercent } from '../../utils/formatUtils'
import { getPriceChange, getRecordedRangeSinceEntry } from '../../utils/stockStats'
import { SPY_BUY, SPY_HISTORY } from './landingStory'
import { GLASS_TOOLTIP_CLASS, GLIDING_TOOLTIP, trackTooltipDrift } from '../../utils/chartTooltip'

const dayFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
const timeFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
const history = SPY_HISTORY.map(point => ({ time: dayFormatter.format(new Date(point.timestamp)), price: point.currentPrice }))
const latest = SPY_HISTORY[SPY_HISTORY.length - 1].currentPrice
const change = getPriceChange(SPY_BUY.priceSnapshot, latest)
const recordedRange = getRecordedRangeSinceEntry(SPY_BUY.timestamp, SPY_HISTORY)
const entryDate = new Date(SPY_BUY.timestamp)

export default function LandingDetailCard() {
  return (
    <div className="w-full max-w-2xl mx-auto bg-surface rounded-lg border border-border p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h3 className="text-2xl font-130 m-0 text-foreground">{SPY_BUY.ticker}</h3>
          <span className={journalBadge(SPY_BUY.entryType)}>Buy</span>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">{dayFormatter.format(entryDate)} {timeFormatter.format(entryDate)}</div>
          <div className="text-sm text-foreground mt-1">Snapshot: {SPY_BUY.priceSnapshot == null ? '—' : formatCurrency(SPY_BUY.priceSnapshot)}</div>
        </div>
      </div>

      <p className="text-sm text-foreground leading-relaxed mb-5">{SPY_BUY.body}</p>

      <div onPointerMove={trackTooltipDrift} className="h-56 [@media(min-width:768px)_and_(max-height:760px)]:h-40 mb-5">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
            <XAxis
              dataKey="time"
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
              tickFormatter={(value) => `$${value}`}
              domain={[715, 785]}
              ticks={[720, 740, 760, 780]}
            />
            <Tooltip {...GLIDING_TOOLTIP} content={({ active, payload, label }) => active && payload?.length ? (
              <div className={`${GLASS_TOOLTIP_CLASS} px-3 py-2 text-sm text-foreground`}>
                {label}: {formatCompactCurrency(Number(payload[0].value))}
              </div>
            ) : null} />
            <Line
              type="monotone"
              dataKey="price"
              stroke="var(--color-gain)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <ReferenceDot
              x={dayFormatter.format(entryDate)}
              y={SPY_BUY.priceSnapshot ?? undefined}
              r={6}
              fill="var(--color-gain)"
              stroke="var(--color-foreground)"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-surface-hover rounded-md border border-border">
          <div className="text-xs text-muted mb-1">Latest Price</div>
          <div className="text-sm font-130 text-foreground">{formatCurrency(latest)}</div>
        </div>
        <div className="p-3 bg-surface-hover rounded-md border border-border">
          <div className="text-xs text-muted mb-1">Price Change Since Purchase</div>
          <div className="text-sm font-130 text-gain">{change ? formatSignedCurrencyWithPercent(change.diff, change.percent).replace('(', `(${change.percent >= 0 ? '+' : '-'}`) : '—'}</div>
        </div>
        <div className="p-3 bg-surface-hover rounded-md border border-border">
          <div className="text-xs text-muted mb-1">Lowest Recorded Price</div>
          <div className="text-sm font-130 text-foreground">{recordedRange ? formatCurrency(recordedRange.lowest.price) : '—'}</div>
          {recordedRange && <div className="text-xs text-muted">{dateFormatter.format(new Date(recordedRange.lowest.timestamp))}</div>}
        </div>
        <div className="p-3 bg-surface-hover rounded-md border border-border">
          <div className="text-xs text-muted mb-1">Highest Recorded Price</div>
          <div className="text-sm font-130 text-foreground">{recordedRange ? formatCurrency(recordedRange.highest.price) : '—'}</div>
          {recordedRange && <div className="text-xs text-muted">{dateFormatter.format(new Date(recordedRange.highest.timestamp))}</div>}
        </div>
      </div>

      <button type="button" aria-disabled="true" tabIndex={-1} className="mt-4 px-3 py-2 text-sm text-primary border border-border rounded-md pointer-events-none">
        Reflect on this entry
      </button>
    </div>
  )
}
