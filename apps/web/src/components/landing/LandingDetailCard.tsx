import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts'

import { formatCurrency, formatSignedCurrency } from '../../utils/formatUtils'

const entry = {
  ticker: 'SPY',
  date: 'Jun 18',
  time: '3:50 PM',
  price: 750,
  body: 'Bought near close as markets begin to rebound after yesterday’s debut from the new Fed chair.',
}

const history = [
  { time: 'Jun 15', price: 735 },
  { time: 'Jun 16', price: 731 },
  { time: 'Jun 17', price: 745 },
  { time: entry.date, price: entry.price },
  { time: 'Jun 22', price: 748 },
  { time: 'Jun 23', price: 768 },
]

const entryIndex = history.findIndex((point) => point.time === entry.date)
const subsequentPrices = history.slice(entryIndex).map((point) => point.price)
const outcome = {
  latest: history[history.length - 1],
  low: Math.min(...subsequentPrices),
  high: Math.max(...subsequentPrices),
}
const change = outcome.latest.price - entry.price
const changePercent = (change / entry.price) * 100

export default function LandingDetailCard() {
  return (
    <div className="w-full max-w-2xl mx-auto bg-surface rounded-lg border border-border p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h3 className="text-2xl font-150 m-0 text-foreground">{entry.ticker}</h3>
          <span className="px-2 py-0.5 text-xs font-130 uppercase bg-gain/10 text-gain rounded">BUY</span>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">{entry.date} {entry.time}</div>
          <div className="text-sm text-foreground mt-1">Snapshot: {formatCurrency(entry.price)}</div>
        </div>
      </div>

      <p className="text-sm text-foreground leading-relaxed mb-5">{entry.body}</p>

      <div className="h-56 mb-5">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis
              dataKey="time"
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
            />
            <YAxis
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
              tickFormatter={(value) => `$${value}`}
              domain={['dataMin - 15', 'dataMax + 15']}
            />
            <Tooltip
              formatter={(value: number) => [`$${value}`, 'Price']}
              contentStyle={{
                backgroundColor: '#32393d',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '6px',
                color: '#bdbdbd',
              }}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <ReferenceDot
              x={entry.date}
              y={entry.price}
              r={6}
              fill="#10b981"
              stroke="#fff"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-surface-hover rounded-md border border-border">
          <div className="text-xs text-muted mb-1">Entry Price</div>
          <div className="text-sm font-130 text-foreground">{formatCurrency(entry.price)}</div>
        </div>
        <div className="p-3 bg-surface-hover rounded-md border border-border">
          <div className="text-xs text-muted mb-1">Change Since Entry</div>
          <div className="text-sm font-130 text-gain">{formatSignedCurrency(change)} (+{changePercent.toFixed(1)}%)</div>
        </div>
        <div className="p-3 bg-surface-hover rounded-md border border-border">
          <div className="text-xs text-muted mb-1">Lowest Since Entry</div>
          <div className="text-sm font-130 text-foreground">{formatCurrency(outcome.low)}</div>
        </div>
        <div className="p-3 bg-surface-hover rounded-md border border-border">
          <div className="text-xs text-muted mb-1">Highest Since Entry</div>
          <div className="text-sm font-130 text-foreground">{formatCurrency(outcome.high)}</div>
        </div>
      </div>
    </div>
  )
}
