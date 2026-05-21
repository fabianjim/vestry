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
import * as d3 from 'd3'

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

// Extract cubic bezier segments from a d3 monotone path.
// A monotone path looks like: M x0 y0 C cp1x cp1y cp2x cp2y x1 y1 C cp1x cp1y cp2x cp2y x2 y2
// We return an array where segments[i] is a standalone SVG path drawing from data[i] to data[i+1].
function extractMonotoneSegments(pathD: string): string[] {
  const segments: string[] = []

  // Split at every C, keeping the C as the start of each piece
  // e.g. "M0,100C16,100,33,90,50,90C66,90,83,80,100,80"
  //   -> ["M0,100", "C16,100,33,90,50,90", "C66,90,83,80,100,80"]
  const pieces = pathD.split(/(?=C)/)
  if (pieces.length < 2) return segments

  // Segment 0: combine the M piece with the first C piece
  // e.g. "M0,100" + "C16,100,33,90,50,90" -> "M0,100C16,100,33,90,50,90"
  segments.push(pieces[0] + pieces[1])

  // For each subsequent C piece, prepend "Mx,y" where x,y is the endpoint of the previous segment.
  // A C command ends with "...,endX,endY". Extract those two numbers.
  let lastEnd = ''
  const endMatch = pieces[1].match(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/)
  if (endMatch) {
    lastEnd = endMatch[1] + ',' + endMatch[2]
  }

  for (let i = 2; i < pieces.length; i++) {
    const piece = pieces[i]
    if (lastEnd) {
      segments.push('M' + lastEnd + piece)
    }
    const m = piece.match(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/)
    if (m) {
      lastEnd = m[1] + ',' + m[2]
    }
  }

  return segments
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

  // Build screen-space points and generate the full monotone path with d3
  // (same curveMonotoneX algorithm Recharts uses for type="monotone")
  const screenPoints = data.map((p) => [xAxis.scale(p.timestamp), yAxis.scale(p.value)] as [number, number])
  const lineGenerator = d3.line().curve(d3.curveMonotoneX)
  const fullPath = lineGenerator(screenPoints)
  const segments = fullPath ? extractMonotoneSegments(fullPath) : []

  return (
    <g>
      {data.map((point, index) => {
        if (!point.isTransaction || index === 0) return null

        const segment = segments[index - 1]
        if (!segment) return null

        const cx = xAxis.scale(point.timestamp)
        const cy = yAxis.scale(point.value)
        const circleColor = point.transactionType === 'BUY' ? '#10b981' : '#ef4444'

        return (
          // Buy/Sell event dashed line and hollow circle
          <g key={`tx-${index}`}>
            {/* background colored line to remove solid line*/}
            <path
              d={segment}
              stroke="#32393d"
              strokeWidth={6}
              fill="none"
            />
            {/* dashed curve — identical path to the solid monotone line */}
            <path
              d={segment}
              stroke={lineColor}
              strokeWidth={2}
              strokeDasharray="6,4"
              fill="none"
            />

            {/* hollow circle */}
            <circle
              cx={cx}
              cy={cy}
              r={5}
              fill="none"
              stroke={circleColor}
              strokeWidth={2}
              style={{ cursor: point.journalEntryId ? 'pointer' : 'default' }}
            />
            {/* clickable area for the hollow circle */}
            <circle
              cx={cx}
              cy={cy}
              r={5}
              fill="transparent"
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

      // BUY/SELL EVENT POINT INTEGRATION
      
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
    return processedData.map((p) => p.timestamp)
  }, [processedData])

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
                  viewMode === 'hourly'
                    ? new Date(value).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : new Date(value).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
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
              {viewMode === 'hourly' && (
                <Customized
                  component={() => (
                    <TransactionOverlay
                      data={processedData}
                      lineColor={lineColor}
                      onPinClick={onPinClick}
                    />
                  )}
                />
              )}
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
