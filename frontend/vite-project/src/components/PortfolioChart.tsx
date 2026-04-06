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
    } catch (err) {
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

  const lineColor = isPositiveTrend ? '#28a745' : '#dc3545'

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
      <div style={{ 
        height: 300, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#f8f9fa',
        borderRadius: 8 
      }}>
        Loading chart...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ 
        height: 300, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#f8d7da',
        color: '#721c24',
        borderRadius: 8 
      }}>
        {error}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div style={{ 
        height: 300, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#f8f9fa',
        borderRadius: 8,
        color: '#6c757d'
      }}>
        No historical data available
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: 'white', padding: 20, borderRadius: 8, border: '1px solid #dee2e6' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <button
            onClick={() => setViewMode('hourly')}
            style={{
              padding: '8px 16px',
              backgroundColor: viewMode === 'hourly' ? '#007bff' : '#f8f9fa',
              color: viewMode === 'hourly' ? 'white' : '#333',
              border: '1px solid #dee2e6',
              borderRadius: '4px 0 0 4px',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Hourly
          </button>
          <button
            onClick={() => setViewMode('daily')}
            style={{
              padding: '8px 16px',
              backgroundColor: viewMode === 'daily' ? '#007bff' : '#f8f9fa',
              color: viewMode === 'daily' ? 'white' : '#333',
              border: '1px solid #dee2e6',
              borderLeft: 'none',
              borderRadius: '0 4px 4px 0',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Daily
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handlePrevious}
            aria-label="Previous period"
            style={{
              padding: '8px 12px',
              backgroundColor: '#f8f9fa',
              border: '1px solid #dee2e6',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 16,
              color: '#333',
            }}
          >
            ←
          </button>
          
          <span style={{ fontSize: 14, color: '#6c757d', minWidth: 100, textAlign: 'center' }}>
            {viewMode === 'hourly'
              ? currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : 'Last 5 Days'
            }
          </span>
          
          <button
            onClick={handleNext}
            disabled={!canGoForward}
            aria-label="Next period"
            style={{
              padding: '8px 12px',
              backgroundColor: canGoForward ? '#f8f9fa' : '#e9ecef',
              border: '1px solid #dee2e6',
              borderRadius: 4,
              cursor: canGoForward ? 'pointer' : 'not-allowed',
              fontSize: 16,
              opacity: canGoForward ? 1 : 0.5,
              color: '#333',
            }}
          >
            →
          </button>
        </div>
      </div>

      {processedData.length > 0 ? (
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={processedData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
              <XAxis 
                dataKey="time" 
                stroke="#6c757d"
                fontSize={12}
                tickLine={false}
              />
              <YAxis 
                domain={[(dataMin: number) => dataMin * 0.995, (dataMax: number) => dataMax * 1.005]}
                stroke="#6c757d"
                fontSize={12}
                tickLine={false}
                tickFormatter={(value) => formatCurrency(value)}
                tickCount={3}
              />
              <Tooltip 
                formatter={(value: number) => [formatCurrency(value), 'Portfolio Value']}
                labelFormatter={(label) => viewMode === 'hourly' ? `Time: ${label}` : `Date: ${label}`}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #dee2e6',
                  borderRadius: 4,
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
        <div style={{ 
          height: 300, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          backgroundColor: '#f8f9fa',
          borderRadius: 8,
          color: '#6c757d'
        }}
      >
        <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, marginBottom: 8 }}>No data for this {viewMode === 'hourly' ? 'day' : 'period'}</div>
            <div style={{ fontSize: 14 }}>Try navigating to a different period</div>
          </div>
        </div>
      )}
    </div>
  )
}
