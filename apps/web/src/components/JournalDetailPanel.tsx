import { useEffect, useState, useMemo, useRef } from 'react'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts'
import type { JournalEntry } from '../types/journal'
import type { Transaction } from '../types/transaction'
import type { StockHistoryPoint } from '../types/stock'
import { stockApi, journalApi, portfolioApi } from '../services/api'
import { formatDateTime } from '../utils/dateUtils'
import {
  getPriceChange,
  getRecordedRangeSinceEntry,
  getRealizedPnLForSell,
  matchJournalTransaction,
} from '../utils/stockStats'
import { formatSignedCurrencyWithPercent } from '../utils/formatUtils'

type Props = {
  entry: JournalEntry
  onClose: () => void
  onEntryClick: (entry: JournalEntry) => void
}

type ChartPoint = {
  time: string
  price: number
  fullTimestamp: string
}

type StockDataResponse = {
  stock: {
    currentPrice: number
  } | null
}

export default function JournalDetailPanel({ entry, onClose, onEntryClick }: Props) {
  const [history, setHistory] = useState<StockHistoryPoint[]>([])
  const [relatedEntries, setRelatedEntries] = useState<JournalEntry[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [currentStock, setCurrentStock] = useState<{ currentPrice: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [entry.id])

  useEffect(() => {
    const load = async () => {
      if (!entry.ticker) {
        setHistory([])
        setRelatedEntries([])
        setTransactions([])
        setCurrentStock(null)
        return
      }

      setLoading(true)
      setError('')
      try {
        // Fetch transactions first to determine tracking start date
        const txData = (await portfolioApi.getTransactions()) as Transaction[]
        setTransactions(txData || [])

        const firstTrackingDate = txData
          ?.filter((tx) => tx.ticker === entry.ticker)
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0]
          ?.timestamp || undefined

        const [histData, journalData, stockData] = await Promise.all([
          stockApi.getHistoricalData(entry.ticker, firstTrackingDate),
          journalApi.getEntriesForTicker(entry.ticker),
          stockApi.getStockData(entry.ticker).catch(() => null),
        ])

        setHistory(histData || [])
        setRelatedEntries((journalData || []).filter((e: JournalEntry) => e.id !== entry.id))

        const typedStockData = stockData as StockDataResponse | null
        if (typedStockData?.stock) {
          setCurrentStock({ currentPrice: typedStockData.stock.currentPrice })
        } else {
          setCurrentStock(null)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unexpected error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [entry.id, entry.ticker])

  const matchedTransaction = useMemo(
    () => matchJournalTransaction(entry, transactions),
    [entry, transactions]
  )

  const chartData = useMemo(() => {
    if (!history.length) return []

    const sorted = [...history].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    const byDay = new Map<string, StockHistoryPoint>()
    sorted.forEach((item) => {
      const day = new Date(item.timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
      byDay.set(day, item)
    })

    const points: ChartPoint[] = Array.from(byDay.entries()).map(([time, item]) => ({
      time,
      price: item.currentPrice,
      fullTimestamp: item.timestamp,
    }))

    if (entry.priceSnapshot != null) {
      const entryDay = new Date(entry.timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
      const snapshotPoint = points.find((p) => p.time === entryDay)
      if (snapshotPoint) {
        snapshotPoint.price = entry.priceSnapshot
      }
    }

    return points
  }, [history, entry])

  const latestPrice = currentStock && Number.isFinite(currentStock.currentPrice) && currentStock.currentPrice > 0
    ? currentStock.currentPrice : null
  const priceChange = getPriceChange(matchedTransaction?.price ?? entry.priceSnapshot, latestPrice)
  const priceChangeLabel = entry.entryType === 'BUY' ? 'Price change since purchase'
    : entry.entryType === 'SELL' ? 'Price change since sale' : 'Price change since entry'
  const recordedRange = useMemo(
    () => entry.entryType === 'BUY'
      ? getRecordedRangeSinceEntry(matchedTransaction?.timestamp ?? entry.timestamp, history) : null,
    [entry, matchedTransaction, history]
  )
  const realized = useMemo(
    () => entry.entryType === 'SELL' && matchedTransaction
      ? getRealizedPnLForSell(matchedTransaction, transactions) : null,
    [entry.entryType, matchedTransaction, transactions]
  )
  const valueColor = (value: number | null | undefined) =>
    value == null || value === 0 ? 'text-foreground' : value > 0 ? 'text-gain' : 'text-loss'

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
  }

  const getTypeColor = () => {
    switch (entry.entryType) {
      case 'BUY':
        return '#10b981'
      case 'SELL':
        return '#ef4444'
      case 'INSIGHT':
        return '#5e9ed6'
      case 'MARKET_EVENT':
        return '#d6965e'
      default:
        return '#6b7280'
    }
  }

  const lineColor = getTypeColor()

  const entryDay = useMemo(() => {
    return new Date(entry.timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }, [entry.timestamp])

  return (
    <div
      ref={containerRef}
      className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-surface border-l border-border shadow-[-4px_0_12px_rgba(0,0,0,0.15)] z-[1200] p-6 overflow-y-auto"
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-5">
        <div>
          <h2 className="text-2xl font-150 m-0">{entry.ticker || 'Journal Entry'}</h2>
          <span
            className={`text-xs font-130 uppercase ${
              entry.entryType === 'BUY'
                ? 'text-gain'
                : entry.entryType === 'SELL'
                ? 'text-loss'
                : entry.entryType === 'INSIGHT'
                ? 'text-primary'
                : entry.entryType === 'MARKET_EVENT'
                ? 'text-event'
                : 'text-secondary'
            }`}
          >
            {entry.entryType.replace('_', ' ')}
          </span>
        </div>
        <button
          onClick={onClose}
          className="px-3 py-1.5 bg-elevated text-foreground rounded-md hover:bg-surface-hover transition-colors"
        >
          Close
        </button>
      </div>

      {/* Record */}
      <div className="mb-6">
        <div className="text-sm text-foreground mb-1">
          <span className="font-130">Date:</span>{' '}
          {new Date(entry.timestamp).toLocaleDateString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric',
          })}
          {' · '}
          <span className="font-130">Time:</span>{' '}
          {new Date(entry.timestamp).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })}
        </div>
        <div className="text-sm text-foreground mb-1">
          <span className="font-130">Snapshot:</span>{' '}
          {entry.priceSnapshot != null ? formatCurrency(entry.priceSnapshot) : '-'}
          {(entry.entryType === 'BUY' || entry.entryType === 'SELL') && (
            <>
              {' · '}
              <span className="font-130">Shares:</span>{' '}
              {matchedTransaction ? matchedTransaction.shares : '-'}
              {' · '}
              <span className="font-130">Total:</span>{' '}
              {matchedTransaction ? formatCurrency(matchedTransaction.totalValue) : '-'}
            </>
          )}
        </div>
        <div className="text-sm font-90 text-muted mt-3 whitespace-pre-wrap">{entry.body}</div>
      </div>

      {error && <div className="text-error mb-4">{error}</div>}

      {/* Price History Chart */}
      {entry.ticker && (
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
                    formatter={(value: number) => [formatCurrency(value), 'Price']}
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
                  {entry.priceSnapshot != null && (
                    <ReferenceDot
                      x={entryDay}
                      y={entry.priceSnapshot}
                      r={6}
                      fill={lineColor}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Performance Section */}
      {entry.ticker && !loading && !error && (
        <div className="mb-6 p-4 bg-surface-hover rounded-lg border border-border">
          <h4 className="text-lg font-150 mb-3">Performance</h4>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Latest price</span>
              <span className="text-foreground">{latestPrice == null ? '—' : formatCurrency(latestPrice)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">{priceChangeLabel}</span>
              <span className={valueColor(priceChange?.diff)}>
                {priceChange ? formatSignedCurrencyWithPercent(priceChange.diff, priceChange.percent) : '—'}
              </span>
            </div>
          </div>

          {entry.entryType === 'BUY' && (
            <div className="mt-4 pt-4 border-t border-border space-y-2">
              {(['lowest', 'highest'] as const).map((key) => {
                const point = recordedRange?.[key]
                return (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-muted">{key === 'lowest' ? 'Lowest recorded price' : 'Highest recorded price'}</span>
                  <span className="text-foreground text-right">
                    {point ? formatCurrency(point.price) : '—'}
                    {point && <span className="block text-xs text-muted">
                      {new Date(point.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>}
                  </span>
                </div>
                )
              })}
            </div>
          )}

          {entry.entryType === 'SELL' && (
            <div className="mt-4 pt-4 border-t border-border space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Realized gain/loss</span>
                <span className={valueColor(realized?.realizedPnL)}>
                  {realized
                    ? formatSignedCurrencyWithPercent(realized.realizedPnL, realized.realizedPercent)
                    : '—'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Related Journal Entries */}
      {relatedEntries.length > 0 && (
        <div>
          <h4 className="text-lg font-150 mb-3">Related Journal Entries</h4>
          <div className="flex flex-col gap-3">
            {relatedEntries.map((relatedEntry) => (
              <div
                key={relatedEntry.id}
                onClick={() => onEntryClick(relatedEntry)}
                className="p-3 rounded-md transition-colors bg-surface-hover border border-border cursor-pointer hover:bg-elevated"
              >
                <div className="flex justify-between mb-1">
                  <span
                    className={`text-xs font-130 uppercase ${
                      relatedEntry.entryType === 'BUY'
                        ? 'text-gain'
                        : relatedEntry.entryType === 'SELL'
                        ? 'text-loss'
                        : relatedEntry.entryType === 'INSIGHT'
                        ? 'text-primary'
                        : relatedEntry.entryType === 'MARKET_EVENT'
                        ? 'text-event'
                        : 'text-secondary'
                    }`}
                  >
                    {relatedEntry.entryType.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-muted">{formatDateTime(relatedEntry.timestamp)}</span>
                </div>
                {relatedEntry.priceSnapshot != null && (
                  <div className="text-xs text-muted mb-1">
                    Snapshot: ${relatedEntry.priceSnapshot.toFixed(2)}
                  </div>
                )}
                <div className="text-sm text-foreground whitespace-pre-wrap line-clamp-3">
                  {relatedEntry.body}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
