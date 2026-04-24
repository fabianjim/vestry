import { useState, useEffect, useMemo, useRef } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { portfolioApi } from '../services/api'

interface HistoryData {
  timestamp: string
  portfolioValue: number
}

interface ChartDataPoint {
  time: string
  value: number
  fullTimestamp: string
}

export default function PortfolioChart() {
  const [data, setData] = useState<HistoryData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'hourly' | 'daily'>('hourly')
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const hasAnimatedRef = useRef(false)

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    try {
      setLoading(true)
      setError(null)
      const history = await portfolioApi.getPortfolioHistory()
      setData(history || [])
      if (!hasAnimatedRef.current && history && history.length > 0) {
        hasAnimatedRef.current = true
      }
    } catch {
      setError('Failed to load portfolio history')
    } finally {
      setLoading(false)
    }
  }

  // Process data based on view mode
  const processedData: ChartDataPoint[] = useMemo(() => {
    if (!data || data.length === 0) return []

    if (viewMode === 'hourly') {
      // Show hourly data for current trading day
      const startOfDay = new Date(currentDate)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(currentDate)
      endOfDay.setHours(23, 59, 59, 999)

      return data
        .filter((item) => {
          const itemDate = new Date(item.timestamp)
          return itemDate >= startOfDay && itemDate <= endOfDay
        })
        .map((item) => ({
          time: new Date(item.timestamp).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }),
          value: item.portfolioValue,
          fullTimestamp: item.timestamp,
        }))
    } else {
      // Show daily aggregation for last 5 trading days
      // TODO: Only trading days
      const dailyData: { [key: string]: HistoryData } = {}

      data.forEach((item) => {
        const date = new Date(item.timestamp)
        const dateKey = date.toDateString()

        // Keep the latest value for each day
        if (!dailyData[dateKey] || new Date(item.timestamp) > new Date(dailyData[dateKey].timestamp)) {
          dailyData[dateKey] = item
        }
      })

      return Object.values(dailyData)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .slice(-5) // Last 5 days
        .map((item) => ({
          time: new Date(item.timestamp).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          }),
          value: item.portfolioValue,
          fullTimestamp: item.timestamp,
        }))
    }
  }, [data, viewMode, currentDate])

  // Calculate trend for color
  const isPositiveTrend = useMemo(() => {
    if (processedData.length < 2) return true
    return processedData[processedData.length - 1].value >= processedData[0].value
  }, [processedData])

  const lineColor = isPositiveTrend ? '#10b981' : '#ef4444'

  const handlePrevious = () => {
    const newDate = new Date(currentDate)
    if (viewMode === 'hourly') {
      newDate.setDate(newDate.getDate() - 1)
    } else {
      newDate.setDate(newDate.getDate() - 5)
    }
    setCurrentDate(newDate)
  }

  const handleNext = () => {
    const today = new Date()
    const newDate = new Date(currentDate)
    if (viewMode === 'hourly') {
      newDate.setDate(newDate.getDate() + 1)
    } else {
      newDate.setDate(newDate.getDate() + 5)
    }
    // Don't go past today
    if (newDate <= today) {
      setCurrentDate(newDate)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const canGoForward = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const current = new Date(currentDate)
    current.setHours(0, 0, 0, 0)
    return current < today
  }, [currentDate])

  if (loading) {
    return (
      <div className="h-72 flex items-center justify-center bg-surface rounded-lg border border-border">
        <span className="text-muted">Loading chart...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-72 flex items-center justify-center bg-surface rounded-lg border border-border text-error">
        {error}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center bg-surface rounded-lg border border-border text-muted">
        No historical data available
      </div>
    )
  }

  return (
    <div className="bg-surface p-5 rounded-lg border border-border">
      <div className="flex justify-between items-center mb-5">
        <div>
          <button
            onClick={() => setViewMode('hourly')}
            className={`px-4 py-2 text-sm border border-border rounded-l-md cursor-pointer transition-colors ${
              viewMode === 'hourly'
                ? 'bg-primary text-primary-foreground'
                : 'bg-elevated text-foreground hover:bg-elevated/75'
            }`}
          >
            Hourly
          </button>
          <button
            onClick={() => setViewMode('daily')}
            className={`px-4 py-2 text-sm border border-border border-l-0 rounded-r-md cursor-pointer transition-colors ${
              viewMode === 'daily'
                ? 'bg-primary text-primary-foreground'
                : 'bg-elevated text-foreground hover:bg-elevated/75'
            }`}
          >
            Daily
          </button>
        </div>

        <div className="flex gap-2 items-center">
          <button
            onClick={handlePrevious}
            aria-label="Previous period"
            className="px-3 py-2 bg-elevated border border-border rounded-md cursor-pointer text-lg text-foreground hover:bg-elevated/75 transition-colors"
          >
            ←
          </button>
          
          <span className="text-sm text-muted min-w-[100px] text-center">
            {viewMode === 'hourly'
              ? currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : 'Last 5 Days'
            }
          </span>
          
          <button
            onClick={handleNext}
            disabled={!canGoForward}
            aria-label="Next period"
            className="px-3 py-2 bg-elevated border border-border rounded-md cursor-pointer text-lg text-foreground hover:bg-elevated/75 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            →
          </button>
        </div>
      </div>

      {processedData.length > 0 ? (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={processedData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis 
                dataKey="time" 
                stroke="#6b7280"
                fontSize={12}
                tickLine={false}
              />
              <YAxis 
                domain={[(dataMin: number) => dataMin * 0.995, (dataMax: number) => dataMax * 1.005]}
                stroke="#6b7280"
                fontSize={12}
                tickLine={false}
                tickFormatter={(value) => formatCurrency(value)}
                tickCount={3}
              />
              <Tooltip 
                formatter={(value: number) => [formatCurrency(value), 'Portfolio Value']}
                labelFormatter={(label) => viewMode === 'hourly' ? `Time: ${label}` : `Date: ${label}`}
                contentStyle={{
                  backgroundColor: '#32393d',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '6px',
                  color: '#bdbdbd',
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={lineColor}
                strokeWidth={2}
                dot={{ fill: lineColor, strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, strokeWidth: 0 }}
                isAnimationActive={!hasAnimatedRef.current}
                animationDuration={1000}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-72 flex items-center justify-center bg-surface-hover rounded-lg text-muted">
          <div className="text-center">
            <div className="text-base mb-2">No data for this {viewMode === 'hourly' ? 'day' : 'period'}</div>
            <div className="text-sm">Try navigating to a different period</div>
          </div>
        </div>
      )}
    </div>
  )
}
