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
import { stockApi, journalApi } from '../services/api'
import { formatDateTime } from '../utils/dateUtils'
import { SECTOR_COLORS } from '../constants/colors'

type NodeDetailPanelProps = {
  ticker: string
  metadata: StockMetadata | null
  onClose: () => void
  isWatchlist: boolean
  trackingStartDate: string | null
  onEntryClick?: (entry: JournalEntry) => void
}

type StockHistoryPoint = {
  timestamp: string
  currentPrice: number
}

type ChartPoint = {
  time: string
  price: number
  fullTimestamp: string
}

export default function NodeDetailPanel({ ticker, metadata, onClose, isWatchlist, trackingStartDate, onEntryClick }: NodeDetailPanelProps) {
  const [history, setHistory] = useState<StockHistoryPoint[]>([])
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
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

  const lineColor = metadata?.sector ? SECTOR_COLORS[metadata.sector] || '#6b7280' : '#6b7280'

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value)
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
          <div className="text-sm text-muted mb-1">
            <span className="font-150">{metadata.etf ? 'Asset Class' : 'Sector'}:</span>{' '}
            {metadata.sector || '-'}
          </div>
          <div className="text-sm text-muted mb-1">
            <span className="font-150">{metadata.etf ? 'Category' : 'Industry'}:</span>{' '}
            {metadata.industry || '-'}
          </div>
          <div className="text-sm text-muted mb-1">
            <span className="font-150">{metadata.etf ? 'Region' : 'Country'}:</span>{' '}
            {metadata.country || '-'}
          </div>
          <div className="text-sm text-muted">
            <span className="font-150">Market Cap Tier:</span>{' '}
            {metadata.marketCapTier
              ? metadata.marketCapTier.replace('_', ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase())
              : '-'}
          </div>
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
