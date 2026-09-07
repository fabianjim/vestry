import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts'

interface ChartPoint {
  time: string
  price: number
}

interface LandingDetailCardProps {
  onChartClick?: () => void
}

const history: ChartPoint[] = [
  { time: 'Jun 15', price: 735 },
  { time: 'Jun 16', price: 731 },
  { time: 'Jun 17', price: 745 },
  { time: 'Jun 18', price: 750 },
  { time: 'Jun 22', price: 748 },
  { time: 'Jun 23', price: 768 }

]

export default function LandingDetailCard({ onChartClick }: LandingDetailCardProps) {

  const handleClick = () => {
    onChartClick?.()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
      className={`w-full max-w-2xl mx-auto bg-surface rounded-lg border border-border p-6 cursor-pointer transition-colors hover:border-primary/30 focus:outline-none`}
    >
      <div className="flex justify-between items-start mb-5">
        <div>
          <h3 className="text-2xl font-150 m-0 text-foreground">SPY</h3>
          <span className="px-2 py-0.5 text-xs font-130 uppercase bg-gain/10 text-gain rounded">BUY</span>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">Jun 18 3:50PM</div>
          <div className="text-sm text-foreground mt-1">Snapshot: $750.00</div>
        </div>
      </div>

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
              x="Jun 18"
              y={750}
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
          <div className="text-sm font-130 text-foreground">$750.00</div>
        </div>
        <div className="p-3 bg-surface-hover rounded-md border border-border">
          <div className="text-xs text-muted mb-1">Price Change</div>
          <div className="text-sm font-130 text-gain">+$18.00 (+2.5%)</div>
        </div>
        <div className="p-3 bg-surface-hover rounded-md border border-border">
          <div className="text-xs text-muted mb-1">Days Since</div>
          <div className="text-sm font-130 text-foreground">4</div>
        </div>
        <div className="p-3 bg-surface-hover rounded-md border border-border">
          <div className="text-xs text-muted mb-1">Position</div>
          <div className="text-sm font-130 text-foreground">Long</div>
        </div>
      </div>
    </div>
  )
}
