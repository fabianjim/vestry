import { useState, useEffect, useMemo, useRef } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Customized,
} from 'recharts'
import { useXAxis, useYAxis } from 'recharts/es6/hooks'
import { portfolioApi, journalApi } from '../services/api'
import type { JournalEntry } from '../types/journal'
import type { Transaction } from '../types/transaction'

interface HistoryData {
  timestamp: string
  portfolioValue: number
}

interface ChartDataPoint {
  timestamp: number
  time: string
  value: number
  fullTimestamp: string
  isTransaction?: boolean
  transactionType?: 'BUY' | 'SELL'
  journalEntryId?: number
}

interface Props {
  onPinClick?: (journalEntryId: number) => void
}

function isTradingHours(timestamp: string | number | Date): boolean {
  const date = new Date(timestamp)
  const hour = date.getHours()
  const minute = date.getMinutes()
  const timeValue = hour + minute / 60
  return timeValue >= 10 && timeValue <= 16
}

function TransactionOverlay({
  data,
  lineColor,
  onPinClick,
}: {
  data: ChartDataPoint[]
  lineColor: string
  onPinClick?: (journalEntryId: number) => void
}) {
  const xAxis = useXAxis(0)
  const yAxis = useYAxis(0)

  if (!xAxis || !yAxis) return null

  return (
    <g>
      {data.map((point, index) => {
        if (!point.isTransaction || index === 0) return null

        const prevPoint = data[index - 1]
        const x1 = xAxis.scale(prevPoint.timestamp)
        const y1 = yAxis.scale(prevPoint.value)
        const x2 = xAxis.scale(point.timestamp)
        const y2 = yAxis.scale(point.value)

        const cx = xAxis.scale(point.timestamp)
        const cy = yAxis.scale(point.value)

        const circleColor = point.transactionType === 'BUY' ? '#10b981' : '#ef4444'

        return (
          <g key={`tx-${index}`}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={lineColor}
              strokeWidth={2}
              strokeDasharray="6,4"
            />
            <circle
              cx={cx}
              cy={cy}
              r={5}
              fill="none"
              stroke={circleColor}
              strokeWidth={2}
              style={{ cursor: point.journalEntryId ? 'pointer' : 'default' }}
              onClick={() => {
                if (point.journalEntryId && onPinClick) {
                  onPinClick(point.journalEntryId)
                }
              }}
            />
          </g>
        )
      })}
    </g>
  )
}

export default function PortfolioChart({ onPinClick }: Props) {
  const [data, setData] = useState<HistoryData[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'hourly' | 'daily'>('hourly')
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const hasAnimatedRef = useRef(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [history, txList, entries] = await Promise.all([
        portfolioApi.getPortfolioHistory(),
        portfolioApi.getTransactions(),
        journalApi.getEntries(),
      ])
      setData(history || [])
      setTransactions(txList || [])
      setJournalEntries(entries || [])
      if (!hasAnimatedRef.current && history && history.length > 0) {
        hasAnimatedRef.current = true
      }
    } catch {
      setError('Failed to load chart data')
    } finally {
      setLoading(false)
    }
  }

  const processedData: ChartDataPoint[] = useMemo(() => {
    if (!data || data.length === 0) return []

    if (viewMode === 'hourly') {
      // Filter portfolio history to current day AND trading hours (10am-4pm)
      const dayHistory = data
        .filter((item) => {
          const itemDate = new Date(item.timestamp)
          const isSameDay = itemDate.toDateString() === currentDate.toDateString()
          return isSameDay && isTradingHours(item.timestamp)
        })
        .map((item) => ({
          timestamp: new Date(item.timestamp).getTime(),
          time: new Date(item.timestamp).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }),
          value: item.portfolioValue,
          fullTimestamp: item.timestamp,
          isTransaction: false,
        }))

      // Filter transactions to current day AND trading hours (10am-4pm)
      const dayTransactions = transactions.filter((tx) => {
        const txDate = new Date(tx.timestamp)
        const isSameDay = txDate.toDateString() === currentDate.toDateString()
        return isSameDay && isTradingHours(tx.timestamp)
      })

      // Insert synthetic transaction points
      const merged: ChartDataPoint[] = [...dayHistory]

      for (const tx of dayTransactions) {
        const txTime = new Date(tx.timestamp).getTime()

        // Find closest previous portfolio history point
        let prevPoint = merged
          .filter((p) => !p.isTransaction && p.timestamp <= txTime)
          .sort((a, b) => b.timestamp - a.timestamp)[0]

        if (!prevPoint && merged.length > 0) {
          // Use first available point if no previous
          prevPoint = merged[0]
        }

        if (!prevPoint) continue

        const syntheticValue =
          tx.type === 'BUY'
            ? prevPoint.value + tx.totalValue
            : prevPoint.value - tx.totalValue

        // Match to journal entry
        const txType = tx.type as 'BUY' | 'SELL'
        const matchedEntry = journalEntries
          .filter(
            (e) =>
              e.entryType === txType &&
              e.ticker === tx.ticker &&
              Math.abs(new Date(e.timestamp).getTime() - txTime) <= 5 * 60 * 1000
          )
          .sort(
            (a, b) =>
              Math.abs(new Date(a.timestamp).getTime() - txTime) -
              Math.abs(new Date(b.timestamp).getTime() - txTime)
          )[0]

        merged.push({
          timestamp: txTime,
          time: new Date(tx.timestamp).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }),
          value: syntheticValue,
          fullTimestamp: tx.timestamp,
          isTransaction: true,
          transactionType: txType,
          journalEntryId: matchedEntry?.id,
        })
      }

      // Sort by timestamp
      merged.sort((a, b) => a.timestamp - b.timestamp)

      return merged
    } else {
      const dailyData: { [key: string]: HistoryData } = {}

      data.forEach((item) => {
        const date = new Date(item.timestamp)
        const dateKey = date.toDateString()

        if (!dailyData[dateKey] || new Date(item.timestamp) > new Date(dailyData[dateKey].timestamp)) {
          dailyData[dateKey] = item
        }
      })

      return Object.values(dailyData)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .slice(-5)
        .map((item) => ({
          timestamp: new Date(item.timestamp).getTime(),
          time: new Date(item.timestamp).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          }),
          value: item.portfolioValue,
          fullTimestamp: item.timestamp,
          isTransaction: false,
        }))
    }
  }, [data, transactions, journalEntries, viewMode, currentDate])

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

  // Dynamic ticks from actual data points (one tick per point)
  const xAxisTicks = useMemo(() => {
    if (viewMode !== 'hourly') return undefined
    return processedData.map((p) => p.timestamp)
  }, [processedData, viewMode])

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
              : 'Last 5 Days'}
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
                dataKey="timestamp"
                type="number"
                ticks={xAxisTicks}
                stroke="#6b7280"
                fontSize={12}
                tickLine={false}
                tickFormatter={(value) =>
                  new Date(value).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })
                }
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
                labelFormatter={(label) =>
                  viewMode === 'hourly'
                    ? `Time: ${new Date(label).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
                    : `Date: ${new Date(label).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
                }
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
                dot={(props: { cx?: number; cy?: number; payload?: { isTransaction?: boolean } }) => {
                  const { cx, cy, payload } = props
                  if (payload?.isTransaction) return <g />
                  return <circle cx={cx} cy={cy} r={4} fill={lineColor} strokeWidth={0} />
                }}
                activeDot={{ r: 6, strokeWidth: 0 }}
                isAnimationActive={!hasAnimatedRef.current}
                animationDuration={1000}
              />
              <Customized
                component={() => (
                  <TransactionOverlay
                    data={processedData}
                    lineColor={lineColor}
                    onPinClick={onPinClick}
                  />
                )}
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
