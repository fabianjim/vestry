import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { SectorBreakdownItem } from '../hooks/useHoldingGraphData'

type SectorBreakdownProps = {
  data: SectorBreakdownItem[]
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

const formatPercent = (value: number) => {
  return `${value.toFixed(1)}%`
}

export default function SectorBreakdown({ data }: SectorBreakdownProps) {
  if (data.length === 0) {
    return (
      <div className="bg-surface rounded-lg border border-border p-4">
        <h3 className="text-lg font-150 mb-3">Sector Allocation</h3>
        <div className="text-muted text-sm">No holdings to display.</div>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-lg border border-border p-4">
      <h3 className="text-lg font-150 mb-3">Sector Allocation</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="sector"
              cx="50%"
              cy="50%"
              outerRadius={80}
              innerRadius={45}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, _name: string, props: { payload?: SectorBreakdownItem }) => {
                const item = props.payload
                if (!item) return [String(value), '']
                return [
                  `${formatCurrency(value)} (${formatPercent(item.percentage)})`,
                  item.sector,
                ]
              }}
              contentStyle={{
                backgroundColor: '#32393d',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '6px',
                color: '#bdbdbd',
              }}
              itemStyle={{ color: '#bdbdbd' }}
              labelStyle={{ color: '#bdbdbd' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 space-y-1.5">
        {data.map((item) => (
          <div key={item.sector} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-sm inline-block"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-foreground">{item.sector}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-secondary">{formatCurrency(item.value)}</span>
              <span className="text-muted w-12 text-right">{formatPercent(item.percentage)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
