import { useState, useEffect, useRef } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
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
  const [chartType, setChartType] = useState<'pie' | 'bar'>('bar')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  if (data.length === 0) {
    return (
      <div className="bg-surface rounded-lg border border-border p-4">
        <h3 className="text-lg font-150 mb-3">Holdings by Value</h3>
        <div className="text-muted text-sm">No holdings to display.</div>
      </div>
    )
  }

  const chartHeight = chartType === 'pie' ? 'h-64' : 'h-72'

  const tooltipFormatter = (value: number, _name: string, props: { payload?: HoldingValueItem }) => {
    const item = props.payload
    if (!item) return [String(value), '']
    return [
      `${formatCurrency(value)} (${formatPercent(item.percentage)})`,
      item.ticker,
    ]
  }

  return (
    <div className="bg-surface rounded-lg border border-border p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-150">Holdings by Value</h3>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 hover:bg-surface-hover rounded transition-colors"
            aria-label="Menu"
          >
            <div className="flex flex-col gap-[3px] w-4">
              <div className="h-[2px] bg-muted rounded-sm" />
              <div className="h-[2px] bg-muted rounded-sm" />
              <div className="h-[2px] bg-muted rounded-sm" />
            </div>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-md shadow-lg z-50 min-w-[180px] py-1">
              <div className="px-3 py-2">
                <div className="text-xs text-muted mb-1.5">View</div>
                <div className="flex bg-elevated rounded-md p-0.5">
                  <button
                    onClick={() => { setChartType('pie'); setMenuOpen(false) }}
                    className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                      chartType === 'pie'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:text-primary-foreground'
                    }`}
                  >
                    Pie
                  </button>
                  <button
                    onClick={() => { setChartType('bar'); setMenuOpen(false) }}
                    className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                      chartType === 'bar'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:text-primary-foreground'
                    }`}
                  >
                    Bar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={`${chartHeight} flex items-center justify-center`}>
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'pie' ? (
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="ticker"
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
                formatter={tooltipFormatter}
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
          ) : (
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
                formatter={tooltipFormatter}
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
          )}
        </ResponsiveContainer>
      </div>

      {chartType === 'pie' && (
        <div className="mt-3 space-y-1.5">
          {data.map((item) => (
            <div key={item.ticker} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-sm inline-block"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-foreground">{item.ticker}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-secondary">{formatCurrency(item.value)}</span>
                <span className="text-muted w-12 text-right">{formatPercent(item.percentage)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
