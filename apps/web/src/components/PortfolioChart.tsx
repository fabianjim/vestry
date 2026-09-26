import { useViewState } from '../contexts/ViewState'
import { useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react'
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
import { useQuery } from '@tanstack/react-query'
import { journalQueries, portfolioQueries } from '../services/queries'
import type { JournalEntry } from '../types/journal'
import type { Transaction } from '../types/transaction'
import type { ChartDataPoint } from '../utils/chartData'
import * as d3 from 'd3'
import { processHourlyData } from '../utils/chartData'
import { CalendarIcon } from './icons'

interface HistoryData {
  timestamp: string
  portfolioValue: number
}

export interface PortfolioChartHandle {
  setHourlyDate: (date: Date) => void
  scrollIntoView: () => void
}

interface Props {
  onPinClick?: (entries: JournalEntry[]) => void
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
  journalEntries,
}: {
  data: ChartDataPoint[]
  lineColor: string
  onPinClick?: (entries: JournalEntry[]) => void
  journalEntries: JournalEntry[]
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
        const circleColor = point.transactionType === 'BUY' ? 'var(--color-buy)' : 'var(--color-sell)'
        const hasEntries = (point.journalEntryIds?.length ?? 0) > 0
        const tradeCount = point.transactionCount ?? 1

        return (
          // Buy/Sell event dashed line and hollow circle
          <g key={`tx-${index}`}>
            {/* background colored line to remove solid line*/}
            <path
              d={segment}
              stroke="var(--color-surface)"
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
              style={{ cursor: hasEntries ? 'pointer' : 'default' }}
            />
            {/* count badge for grouped trades */}
            {tradeCount > 1 && (
              <text
                x={cx}
                y={cy - 10}
                textAnchor="middle"
                fill={circleColor}
                fontSize={10}
                style={{ pointerEvents: 'none' }}
              >
                {tradeCount}
              </text>
            )}
            {/* clickable area for the hollow circle */}
            <circle
              cx={cx}
              cy={cy}
              r={5}
              fill="transparent"
              style={{ cursor: hasEntries ? 'pointer' : 'default' }}
              onClick={() => {
                if (hasEntries && onPinClick) {
                  const entries = (point.journalEntryIds ?? [])
                    .map((id) => journalEntries.find((e) => e.id === id))
                    .filter((e): e is JournalEntry => e != null)
                  if (entries.length > 0) onPinClick(entries)
                }
              }}
            />
          </g>
        )
      })}
    </g>
  )
}

const EMPTY_ENTRIES: JournalEntry[] = []
const EMPTY_HISTORY: HistoryData[] = []
const EMPTY_TRANSACTIONS: Transaction[] = []

const PortfolioChart = forwardRef<PortfolioChartHandle, Props>(function PortfolioChart({ onPinClick }, ref) {
  const historyQuery = useQuery(portfolioQueries.history())
  const transactionsQuery = useQuery(portfolioQueries.transactions())
  const data = historyQuery.data ?? EMPTY_HISTORY
  const transactions = transactionsQuery.data ?? EMPTY_TRANSACTIONS
  const journalQuery = useQuery(journalQueries.entries())
  const journalEntries = journalQuery.data ?? EMPTY_ENTRIES
  const loading = historyQuery.isPending || transactionsQuery.isPending
  const error = historyQuery.error?.message ?? transactionsQuery.error?.message ?? journalQuery.error?.message
  const { chartMode: [viewMode, setViewMode], chartDate: [currentDate, setCurrentDate] } = useViewState()
  const hasAnimatedRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    setHourlyDate: (date: Date) => {
      setViewMode('hourly')
      setCurrentDate(date)
    },
    scrollIntoView: () => {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
  }))

  useEffect(() => {
    if (data.length > 0) hasAnimatedRef.current = true
  }, [data])

  const processedData: ChartDataPoint[] = useMemo(() => {
    if (!data || data.length === 0) return []

    if (viewMode === 'hourly') {
      return processHourlyData(data, transactions, journalEntries, currentDate)
    } else {
      const dailyData: { [key: string]: HistoryData } = {}

      data.forEach((item) => {
        const date = new Date(item.timestamp)
        const dateKey = date.toDateString()

        if (!dailyData[dateKey] || new Date(item.timestamp) > new Date(dailyData[dateKey].timestamp)) {
          dailyData[dateKey] = item
        }
      })

      const sortedDaily = Object.values(dailyData)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
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

      if (sortedDaily.length === 0) return []

      const windowEndTime = new Date(currentDate).getTime()

      // Find the last data point at or before the current navigation date
      let endIndex = sortedDaily.findIndex((p) => p.timestamp > windowEndTime)
      if (endIndex === -1) {
        endIndex = sortedDaily.length
      }
      endIndex = Math.max(0, endIndex - 1)

      const startIndex = Math.max(0, endIndex - 4)
      return sortedDaily.slice(startIndex, endIndex + 1)
    }
  }, [data, transactions, journalEntries, viewMode, currentDate])

  const isPositiveTrend = useMemo(() => {
    if (processedData.length < 2) return true
    return processedData[processedData.length - 1].value >= processedData[0].value
  }, [processedData])

  const lineColor = isPositiveTrend ? 'var(--color-gain)' : 'var(--color-loss)'

  const getPreviousTradingDay = (date: Date): Date => {
    const newDate = new Date(date)
    if (viewMode === 'hourly') {
      newDate.setDate(newDate.getDate() - 1)
      const day = newDate.getDay()
      if (day === 0) newDate.setDate(newDate.getDate() - 2)
      if (day === 6) newDate.setDate(newDate.getDate() - 1)
    } else {
      newDate.setDate(newDate.getDate() - 5)
    }
    return newDate
  }

  const handlePrevious = () => {
    setCurrentDate(getPreviousTradingDay(currentDate))
  }

  const getNextTradingDay = (date: Date): Date => {
    const newDate = new Date(date)
    if (viewMode === 'hourly') {
      newDate.setDate(newDate.getDate() + 1)
      const day = newDate.getDay()
      if (day === 6) newDate.setDate(newDate.getDate() + 2)
      if (day === 0) newDate.setDate(newDate.getDate() + 1)
    } else {
      newDate.setDate(newDate.getDate() + 5)
    }
    return newDate
  }

  const handleNext = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const newDate = getNextTradingDay(currentDate)
    const newDateStart = new Date(newDate)
    newDateStart.setHours(0, 0, 0, 0)
    if (newDateStart <= today) {
      setCurrentDate(newDate)
    }
  }

  // Helpers for daily navigation labels
  const dailyDateRange = useMemo(() => {
    if (viewMode !== 'daily' || processedData.length === 0) return null
    const first = new Date(processedData[0].timestamp)
    const last = new Date(processedData[processedData.length - 1].timestamp)

    // Find the latest date with data
    const dailyData: { [key: string]: HistoryData } = {}
    data.forEach((item) => {
      const date = new Date(item.timestamp)
      const dateKey = date.toDateString()
      if (!dailyData[dateKey] || new Date(item.timestamp) > new Date(dailyData[dateKey].timestamp)) {
        dailyData[dateKey] = item
      }
    })
    const latestTimestamp = Math.max(...Object.values(dailyData).map((d) => new Date(d.timestamp).getTime()))

    const isLatestWindow = last.getTime() === latestTimestamp
    return { first, last, isLatestWindow }
  }, [viewMode, processedData, data])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatDateInput = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const minHistoryDate = useMemo(() => {
    if (!data || data.length === 0) return undefined
    const earliest = Math.min(...data.map((d) => new Date(d.timestamp).getTime()))
    return new Date(earliest)
  }, [data])

  const maxSelectableDate = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  }, [])

  const handleDateSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return
    const [year, month, day] = e.target.value.split('-').map(Number)
    setCurrentDate(new Date(year, month - 1, day))
  }

  const canGoForward = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const nextTradingDay = getNextTradingDay(currentDate)
    nextTradingDay.setHours(0, 0, 0, 0)
    return nextTradingDay <= today
  }, [currentDate])

  // Dynamic ticks from actual data points (one tick per point)
  const xAxisTicks = useMemo(() => {
    return processedData.map((p) => p.timestamp)
  }, [processedData])

  if (loading && !error) {
    return (
      <div className="h-72 flex items-center justify-center bg-surface rounded-lg border border-border">
        <span className="text-muted">Loading chart...</span>
      </div>
    )
  }

  if (error && (!historyQuery.data || !transactionsQuery.data)) {
    return (
      <div className="h-72 flex items-center justify-center bg-surface rounded-lg border border-border text-error">
        {error}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center bg-surface rounded-lg border border-border text-muted">
        {error || 'No historical data available'}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="bg-surface p-5 rounded-lg border border-border"
    >
      {error && <div className="text-error mb-4">{error}</div>}
      <div className="flex justify-between items-center mb-5">
        <div>
          <button
            onClick={() => {
              setViewMode('hourly')
            }}
            className={`px-4 py-2 text-sm border border-border rounded-l-md cursor-pointer transition-colors ${
              viewMode === 'hourly'
                ? 'bg-primary text-primary-foreground'
                : 'bg-elevated text-foreground hover:bg-surface-hover active:bg-surface-active'
            }`}
          >
            Hourly
          </button>
          <button
            onClick={() => {
              if (data.length > 0) {
                const dailyData: { [key: string]: HistoryData } = {}
                data.forEach((item) => {
                  const date = new Date(item.timestamp)
                  const dateKey = date.toDateString()
                  if (!dailyData[dateKey] || new Date(item.timestamp) > new Date(dailyData[dateKey].timestamp)) {
                    dailyData[dateKey] = item
                  }
                })
                const latest = Object.values(dailyData).sort(
                  (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                ).pop()
                if (latest) {
                  setCurrentDate(new Date(latest.timestamp))
                }
              }
              setViewMode('daily')
            }}
            className={`px-4 py-2 text-sm border border-border border-l-0 rounded-r-md cursor-pointer transition-colors ${
              viewMode === 'daily'
                ? 'bg-primary text-primary-foreground'
                : 'bg-elevated text-foreground hover:bg-surface-hover active:bg-surface-active'
            }`}
          >
            Daily
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group focus-within:outline-none focus-within:ring-2 focus-within:ring-primary rounded-md">
            <button
              type="button"
              disabled={data.length === 0}
              aria-hidden="true"
              tabIndex={-1}
              className="w-10 h-10 flex items-center justify-center bg-elevated border border-border rounded-md cursor-pointer text-foreground group-hover:bg-surface-hover transition-colors disabled:bg-disabled-background disabled:text-disabled-foreground disabled:cursor-not-allowed"
            >
              <CalendarIcon className="w-5 h-5" />
            </button>
            <input
              type="date"
              className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed focus:outline-none"
              min={minHistoryDate ? formatDateInput(minHistoryDate) : undefined}
              max={formatDateInput(maxSelectableDate)}
              value={formatDateInput(currentDate)}
              onChange={handleDateSelect}
              aria-label="Select date"
              disabled={data.length === 0}
            />
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevious}
              aria-label="Previous period"
              className="w-10 h-10 flex items-center justify-center bg-elevated border border-border rounded-md cursor-pointer text-lg text-foreground hover:bg-surface-hover active:bg-surface-active transition-colors"
            >
              ←
            </button>

            <span className="text-sm text-muted min-w-[100px] text-center">
              {viewMode === 'hourly'
                ? (() => {
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    const selected = new Date(currentDate)
                    selected.setHours(0, 0, 0, 0)
                    if (selected.getTime() === today.getTime()) {
                      return 'Today'
                    }
                    return currentDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                  })()
                : dailyDateRange
                ? dailyDateRange.isLatestWindow
                  ? 'Last 5 Days'
                  : `${dailyDateRange.first.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })} - ${dailyDateRange.last.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}`
                : 'Last 5 Days'}
            </span>

            <button
              onClick={handleNext}
              disabled={!canGoForward}
              aria-label="Next period"
              className="w-10 h-10 flex items-center justify-center bg-elevated border border-border rounded-md cursor-pointer text-lg text-foreground hover:bg-surface-hover active:bg-surface-active transition-colors disabled:bg-disabled-background disabled:text-disabled-foreground disabled:cursor-not-allowed"
            >
              →
            </button>
          </div>
        </div>
      </div>

      {processedData.length > 0 ? (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={processedData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
              <XAxis
                dataKey="timestamp"
                type="number"
                ticks={xAxisTicks}
                stroke="var(--color-muted)"
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
                stroke="var(--color-muted)"
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
                  backgroundColor: 'var(--color-elevated)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  color: 'var(--color-foreground)',
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
                  journalEntries={journalEntries}
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
})

export default PortfolioChart
