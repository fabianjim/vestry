import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { HoldingValueItem } from '../hooks/useHoldingGraphData'

type HoldingsValueChartProps = {
  data: HoldingValueItem[]
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

export default function HoldingsValueChart({ data }: HoldingsValueChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-surface rounded-lg border border-border p-4">
        <h3 className="text-lg font-150 mb-3">Holdings by Value</h3>
        <div className="text-muted text-sm">No holdings to display.</div>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-lg border border-border p-4">
      <h3 className="text-lg font-150 mb-3">Holdings by Value</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis
              type="number"
              stroke="#bdbdbd"
              fontSize={12}
              tickLine={false}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
            />
            <YAxis
              type="category"
              dataKey="ticker"
              stroke="#bdbdbd"
              fontSize={12}
              tickLine={false}
              width={60}
            />
            <Tooltip
              cursor={{ fill: '#ffffff', fillOpacity: 0.04 }}
              formatter={(value: number, _name: string, props: { payload?: HoldingValueItem }) => {
                const item = props.payload
                if (!item) return [String(value), '']
                return [
                  `${formatCurrency(value)} (${formatPercent(item.percentage)})`,
                  item.ticker,
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
            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
