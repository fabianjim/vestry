import { useEffect, useState, useMemo } from 'react'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { JournalEntry } from '../types/journal'
import type { StockMetadata } from '../types/watchlist'
import type { StockHistoryPoint, StockSnapshot } from '../types/stock'
import { stockApi, journalApi } from '../services/api'
import { formatDateTime, roundToMinute } from '../utils/dateUtils'
import { getCurrentWeekRange } from '../utils/stockStats'
import { SECTOR_COLORS } from '../constants/colors'
import { formatCurrency, formatSignedCurrencyWithPercent } from '../utils/formatUtils'

type NodeDetailPanelProps = {
  ticker: string
  metadata: StockMetadata | null
  onClose: () => void
  isWatchlist: boolean
  trackingStartDate: string | null
  snapshot?: StockSnapshot | null
  lastSuccessfulFetch?: string | null
  onEntryClick?: (entry: JournalEntry) => void
  defaultTab?: TabMode
}

type ChartPoint = {
  time: string
  price: number
  fullTimestamp: string
}

type TabMode = 'performance' | 'metadata'

export default function NodeDetailPanel({ ticker, metadata, onClose, isWatchlist, trackingStartDate, snapshot = null, lastSuccessfulFetch = null, onEntryClick, defaultTab = 'performance' }: NodeDetailPanelProps) {
  const [history, setHistory] = useState<StockHistoryPoint[]>([])
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [activeTab, setActiveTab] = useState<TabMode>(defaultTab)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const journalData = (await journalApi.getEntriesForTicker(ticker)) as JournalEntry[]
        setJournalEntries(journalData || [])

        if (!isWatchlist) {
          const fromParam = trackingStartDate || undefined
          const histData = (await stockApi.getHistoricalData(ticker, fromParam)) as StockHistoryPoint[]
          setHistory(histData || [])
        } else {
          setHistory([])
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unexpected error'
        setError(message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [ticker, isWatchlist, trackingStartDate])

  const chartData: ChartPoint[] = useMemo(() => {
    if (!history || history.length === 0) return []

    // Sort by timestamp ascending
    const sorted = history
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    // Deduplicate by day, keeping the last (most recent) entry per day
    const byDay = new Map<string, StockHistoryPoint>()
    sorted.forEach((item) => {
      const day = new Date(item.timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
      byDay.set(day, item)
    })

    return Array.from(byDay.entries()).map(([time, item]) => ({
      time,
      price: item.currentPrice,
      fullTimestamp: item.timestamp,
    }))
  }, [history])

  const weekRange = useMemo(() => getCurrentWeekRange(history), [history])

  const rangeMetrics = useMemo(() => {
    if (!snapshot || !weekRange || weekRange.high <= weekRange.low) return null

    const currentPercent = ((snapshot.currentPrice - weekRange.low) / (weekRange.high - weekRange.low)) * 100
    const clampedCurrentPercent = Math.max(0, Math.min(100, currentPercent))

    const dayLowPercent = ((snapshot.low - weekRange.low) / (weekRange.high - weekRange.low)) * 100
    const dayHighPercent = ((snapshot.high - weekRange.low) / (weekRange.high - weekRange.low)) * 100

    return {
      currentPercent: clampedCurrentPercent,
      currentPrice: snapshot.currentPrice,
      day: {
        low: snapshot.low,
        high: snapshot.high,
        left: Math.max(0, Math.min(100, dayLowPercent)),
        right: Math.max(0, Math.min(100, dayHighPercent)),
      },
      week: {
        low: weekRange.low,
        high: weekRange.high,
      },
    }
  }, [snapshot, weekRange])

  const lineColor = metadata?.sector ? SECTOR_COLORS[metadata.sector] || '#6b7280' : '#6b7280'

  const trackingChange = useMemo(() => {
    if (!history.length || !snapshot) return null
    const sorted = [...history].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
    const baselinePrice = sorted[0].currentPrice
    if (baselinePrice <= 0) return null
    const currentPrice = snapshot.currentPrice
    const diff = currentPrice - baselinePrice
    const percent = (diff / baselinePrice) * 100
    return { diff, percent }
  }, [history, snapshot])

  const dayChange = useMemo(() => {
    if (!snapshot) return null
    const diff = snapshot.currentPrice - snapshot.prevClose
    const percent = snapshot.prevClose > 0 ? (diff / snapshot.prevClose) * 100 : 0
    return { diff, percent }
  }, [snapshot])

  const renderMetadata = () => (
    <div className="space-y-2">
      <div className="text-sm text-muted">
        <span className="font-150">{metadata?.etf ? 'Asset Class' : 'Sector'}:</span>{' '}
        {metadata?.sector || '-'}
      </div>
      <div className="text-sm text-muted">
        <span className="font-150">{metadata?.etf ? 'Category' : 'Industry'}:</span>{' '}
        {metadata?.industry || '-'}
      </div>
      <div className="text-sm text-muted">
        <span className="font-150">{metadata?.etf ? 'Region' : 'Country'}:</span>{' '}
        {metadata?.country || '-'}
      </div>
      <div className="text-sm text-muted">
        <span className="font-150">Market Cap Tier:</span>{' '}
        {metadata?.marketCapTier
          ? metadata.marketCapTier.replace('_', ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase())
          : '-'}
      </div>
    </div>
  )

  const lastUpdatedLabel = (() => {
    if (!lastSuccessfulFetch) return ''
    const day = new Date(lastSuccessfulFetch).toLocaleDateString('en-US', {
      weekday: 'short',
      timeZone: 'America/New_York',
    })
    const time = roundToMinute(lastSuccessfulFetch)
    if (day === 'Sat' || day === 'Sun') {
      return `Last updated: ${day} ${time}`
    }
    return `Last updated: ${time}`
  })()

  const renderPerformance = () => {
    if (!snapshot) {
      return <div className="text-muted text-sm">No live price data available.</div>
    }

    return (
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted">Current Price</span>
          <span className="text-foreground">{formatCurrency(snapshot.currentPrice)}</span>
        </div>
        {dayChange && (
          <div className="flex justify-between text-sm">
            <span className="text-muted">Day Change</span>
            <span className={dayChange.diff >= 0 ? 'text-gain' : 'text-loss'}>
              {formatSignedCurrencyWithPercent(dayChange.diff, dayChange.percent)}
            </span>
          </div>
        )}
        {trackingChange && (
          <div className="flex justify-between text-sm">
            <span className="text-muted">Since Position Opened</span>
            <span className={trackingChange.diff >= 0 ? 'text-gain' : 'text-loss'}>
              {formatSignedCurrencyWithPercent(trackingChange.diff, trackingChange.percent)}
            </span>
          </div>
        )}
        <div>
          <div className="text-center mb-3">
            <span className="text-sm text-muted">Range</span>
          </div>

          {rangeMetrics ? (
            <div>
              <div className="relative flex justify-center">
                <div className="flex gap-3 w-full max-w-[85%]">
                  <div className="flex flex-col w-8 shrink-0">
                    <div className="h-[0.375rem]" />
                    <div className="h-1 flex items-center justify-end">
                      <span className="text-[10px] text-muted text-right leading-none">Day</span>
                    </div>
                    <div className="flex-1" />
                    <div className="h-1 flex items-center justify-end">
                      <span className="text-[10px] text-muted text-right leading-none">Week</span>
                    </div>
                    {/* Week text vertical positioning */}
                    <div className="h-[2.15rem]" />
                  </div>

                  <div className="relative flex-1 h-[4.5rem]">
                    {/* day range line vertical positioning */ }
                    <div className="absolute top-[0.3125rem] left-0 right-0 h-1">
                      <div
                        className="absolute top-0 bottom-0 bg-elevated"
                        style={{
                          left: `${rangeMetrics.day.left}%`,
                          width: `${rangeMetrics.day.right - rangeMetrics.day.left}%`,
                        }}
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-muted"
                        style={{ left: `${rangeMetrics.day.left}%` }}
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-muted"
                        style={{ left: `${rangeMetrics.day.right}%` }}
                      />
                    </div>
                    { /* week range line vertical positioning */}
                    <div className="absolute bottom-[2.25rem] left-0 right-0 h-1">
                      <div className="absolute inset-0 bg-elevated" />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-muted"
                        style={{ left: '0%' }}
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-muted"
                        style={{ left: '100%' }}
                      />
                    </div>

                    <div
                      className="absolute top-0 w-px bg-primary z-10"
                      style={{
                        left: `${rangeMetrics.currentPercent}%`,
                        height: 'calc(100% - 0.75rem)',
                        transform: 'translateX(-50%)',
                      }}
                      title={`Current: ${formatCurrency(rangeMetrics.currentPrice)}`}
                    />
                    { /* day range high/low vertical positioning */}
                    <div className="absolute top-[.9125rem] left-0 right-0 h-4">
                      {Math.abs(rangeMetrics.day.left) > 2 && (
                        <span
                          className="absolute -translate-x-1/2 text-[9px] text-muted bg-surface px-0.5 z-20"
                          style={{ left: `${rangeMetrics.day.left}%` }}
                        >
                          {formatCurrency(rangeMetrics.day.low)}
                        </span>
                      )}
                      {Math.abs(rangeMetrics.day.right - 100) > 2 && (
                        <span
                          className="absolute -translate-x-1/2 text-[9px] text-muted bg-surface px-0.5 z-20"
                          style={{ left: `${rangeMetrics.day.right}%` }}
                        >
                          {formatCurrency(rangeMetrics.day.high)}
                        </span>
                      )}
                    </div>
                    {/* week range high/low vertical positioning */}
                    <div className="absolute bottom-[.875rem] left-0 right-0 h-4">
                      <span
                        className="absolute -translate-x-1/2 text-[9px] text-muted bg-surface px-0.5 z-20"
                        style={{ left: '0%' }}
                      >
                        {formatCurrency(rangeMetrics.week.low)}
                      </span>
                      <span
                        className="absolute -translate-x-1/2 text-[9px] text-muted bg-surface px-0.5 z-20"
                        style={{ left: '100%' }}
                      >
                        {formatCurrency(rangeMetrics.week.high)}
                      </span>
                    </div>

                    {Math.abs(rangeMetrics.currentPercent) > 3 &&
                      Math.abs(rangeMetrics.currentPercent - 100) > 3 && (
                        <span
                          className="absolute bottom-0 -translate-x-1/2 text-xs text-foreground font-90 whitespace-nowrap bg-surface px-0.5 z-30"
                          style={{ left: `${rangeMetrics.currentPercent}%` }}
                        >
                          {formatCurrency(rangeMetrics.currentPrice)}
                        </span>
                      )}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 max-w-[85%] mx-auto text-xs">
                <div className="text-center">
                  <span className="text-muted block">Day's Low</span>
                  <span className="text-foreground">{formatCurrency(snapshot.low)}</span>
                </div>
                <div className="text-center">
                  <span className="text-muted block">Day's High</span>
                  <span className="text-foreground">{formatCurrency(snapshot.high)}</span>
                </div>
                <div className="text-center">
                  <span className="text-muted block">Week's Low</span>
                  <span className="text-foreground">{weekRange ? formatCurrency(weekRange.low) : '-'}</span>
                </div>
                <div className="text-center">
                  <span className="text-muted block">Week's High</span>
                  <span className="text-foreground">{weekRange ? formatCurrency(weekRange.high) : '-'}</span>
                </div>
                <div className="text-center">
                  <span className="text-muted block">Open</span>
                  <span className="text-foreground">{formatCurrency(snapshot.open)}</span>
                </div>
                <div className="text-center">
                  <span className="text-muted block">Prev Close</span>
                  <span className="text-foreground">{formatCurrency(snapshot.prevClose)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-muted text-sm">No range data available.</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-surface border-l border-border shadow-[-4px_0_12px_rgba(0,0,0,0.15)] z-[1200] p-6 overflow-y-auto">
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-2xl font-150 m-0">{ticker}</h2>
        <button
          onClick={onClose}
          className="px-3 py-1.5 bg-elevated text-foreground rounded-md hover:bg-surface-hover transition-colors"
        >
          Close
        </button>
      </div>

      {metadata && (
        <div className="mb-6">
          {isWatchlist ? (
            renderMetadata()
          ) : (
            <>
              <div className="flex justify-center gap-6 mb-5 border-b border-border pb-0">
                <button
                  onClick={() => setActiveTab('performance')}
                  className={`pb-2 text-sm font-130 transition-colors relative ${
                    activeTab === 'performance'
                      ? 'text-foreground'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  Performance
                  {activeTab === 'performance' && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('metadata')}
                  className={`pb-2 text-sm font-130 transition-colors relative ${
                    activeTab === 'metadata'
                      ? 'text-foreground'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  Metadata
                  {activeTab === 'metadata' && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                  )}
                </button>
              </div>
              {activeTab === 'metadata' ? renderMetadata() : renderPerformance()}
            </>
          )}
        </div>
      )}

      {error && <div className="text-error mb-4">{error}</div>}

      {!isWatchlist && (
        <div className="mb-6">
          <h4 className="text-lg font-150 mb-3">Price History</h4>
          {loading && chartData.length === 0 ? (
            <div className="text-muted">Loading chart...</div>
          ) : chartData.length === 0 ? (
            <div className="text-muted">No price history available.</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="time" stroke="#6b7280" fontSize={12} tickLine={false} />
                  <YAxis
                    stroke="#6b7280"
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(value) => `$${value.toFixed(2)}`}
                    domain={[(dataMin: number) => dataMin * 0.99, (dataMax: number) => dataMax * 1.01]}
                  />
                  <Tooltip
                    formatter={(value: number) => {
                      return [formatCurrency(value), 'Price']
                    }}
                    labelFormatter={(label) => `Date: ${label}`}
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
                    stroke={lineColor}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          {lastUpdatedLabel && (
            <div className="flex justify-end text-xs text-muted italic mt-2">
              {lastUpdatedLabel}
            </div>
          )}
        </div>
      )}

      <div>
        <h4 className="text-lg font-150 mb-3">Journal Entries</h4>
        {journalEntries.length === 0 ? (
          <div className="text-muted italic">No journal entries for {ticker}.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {journalEntries.map((entry) => (
              <div
                key={entry.id}
                onClick={() => onEntryClick?.(entry)}
                className="p-3 rounded-md transition-colors bg-surface-hover border border-border cursor-pointer hover:bg-elevated"
              >
                <div className="flex justify-between mb-1">
                  <span
                    className={`text-xs font-130 uppercase ${
                      entry.entryType === 'BUY'
                        ? 'text-gain'
                        : entry.entryType === 'SELL'
                        ? 'text-loss'
                        : entry.entryType === 'INSIGHT'
                        ? 'text-primary'
                        : 'text-secondary'
                    }`}
                  >
                    {entry.entryType.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-muted">{formatDateTime(entry.timestamp)}</span>
                </div>
                {entry.priceSnapshot != null && (
                  <div className="text-xs text-muted mb-1">
                    Snapshot: ${entry.priceSnapshot.toFixed(2)}
                  </div>
                )}
                <div className="text-sm text-foreground whitespace-pre-wrap">{entry.body}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
