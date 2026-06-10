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
import { stockApi, journalApi, portfolioApi } from '../services/api'
import { formatDateTime } from '../utils/dateUtils'

type Props = {
  entry: JournalEntry
  onClose: () => void
  onEntryClick: (entry: JournalEntry) => void
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
          ?.filter((tx) => tx.ticker === entry.ticker && !tx.initial)
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

  const matchedTransaction = useMemo(() => {
    if (!entry.ticker || !transactions.length) return null
    const entryTime = new Date(entry.timestamp).getTime()
    return transactions.find(
      (tx) =>
        tx.ticker === entry.ticker &&
        !tx.initial &&
        Math.abs(new Date(tx.timestamp).getTime() - entryTime) <= 5 * 60 * 1000
    )
  }, [entry, transactions])

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

  const performance = useMemo(() => {
    if (!currentStock || entry.priceSnapshot == null) return null

    const snapshotPrice = entry.priceSnapshot
    const currentPrice = currentStock.currentPrice
    const priceDiff = currentPrice - snapshotPrice
    const percentDiff = (priceDiff / snapshotPrice) * 100
    const daysSince = Math.floor(
      (Date.now() - new Date(entry.timestamp).getTime()) / (1000 * 60 * 60 * 24)
    )

    return { snapshotPrice, currentPrice, priceDiff, percentDiff, daysSince }
  }, [currentStock, entry])

  const buyMetrics = useMemo(() => {
    if (entry.entryType !== 'BUY' || !matchedTransaction || !currentStock) return null

    const buyPrice = matchedTransaction.price
    const shares = matchedTransaction.shares
    const currentPrice = currentStock.currentPrice
    const costBasis = shares * buyPrice
    const currentValue = shares * currentPrice
    const unrealizedPnL = currentValue - costBasis
    const unrealizedPercent = ((currentPrice - buyPrice) / buyPrice) * 100
    const daysHeld = Math.floor(
      (Date.now() - new Date(entry.timestamp).getTime()) / (1000 * 60 * 60 * 24)
    )

    return { buyPrice, shares, costBasis, currentValue, unrealizedPnL, unrealizedPercent, daysHeld }
  }, [entry, matchedTransaction, currentStock])

  const sellMetrics = useMemo(() => {
    if (entry.entryType !== 'SELL' || !matchedTransaction) return null

    const sellPrice = matchedTransaction.price
    const shares = matchedTransaction.shares
    const proceeds = matchedTransaction.totalValue

    return { sellPrice, shares, proceeds }
  }, [entry, matchedTransaction])

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
        <div className="text-sm text-muted mb-1">
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
        <div className="text-sm text-muted mb-1">
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
        <div className="text-sm text-foreground mt-3 whitespace-pre-wrap">{entry.body}</div>
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
      {performance && (
        <div className="mb-6 p-4 bg-surface-hover rounded-lg border border-border">
          <h4 className="text-lg font-150 mb-3">Performance</h4>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Entry Price</span>
              <span className="text-foreground">{formatCurrency(performance.snapshotPrice)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Current Price</span>
              <span className="text-foreground">{formatCurrency(performance.currentPrice)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Price Change</span>
              <span className={performance.priceDiff >= 0 ? 'text-gain' : 'text-loss'}>
                {performance.priceDiff >= 0 ? '+' : ''}
                {formatCurrency(performance.priceDiff)} ({performance.percentDiff >= 0 ? '+' : ''}
                {performance.percentDiff.toFixed(1)}%)
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Days Since</span>
              <span className="text-foreground">{performance.daysSince}</span>
            </div>
          </div>

          {buyMetrics && (
            <div className="mt-4 pt-4 border-t border-border space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Shares</span>
                <span className="text-foreground">{buyMetrics.shares}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Cost Basis</span>
                <span className="text-foreground">{formatCurrency(buyMetrics.costBasis)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Current Value</span>
                <span className="text-foreground">{formatCurrency(buyMetrics.currentValue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Unrealized P/L</span>
                <span className={buyMetrics.unrealizedPnL >= 0 ? 'text-gain' : 'text-loss'}>
                  {buyMetrics.unrealizedPnL >= 0 ? '+' : ''}
                  {formatCurrency(buyMetrics.unrealizedPnL)} ({buyMetrics.unrealizedPercent >= 0 ? '+' : ''}
                  {buyMetrics.unrealizedPercent.toFixed(1)}%)
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Days Held</span>
                <span className="text-foreground">{buyMetrics.daysHeld}</span>
              </div>
            </div>
          )}

          {sellMetrics && (
            <div className="mt-4 pt-4 border-t border-border space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Shares Sold</span>
                <span className="text-foreground">{sellMetrics.shares}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Sell Price</span>
                <span className="text-foreground">{formatCurrency(sellMetrics.sellPrice)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Proceeds</span>
                <span className="text-foreground">{formatCurrency(sellMetrics.proceeds)}</span>
              </div>
              {currentStock && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Current Price</span>
                  <span className="text-foreground">{formatCurrency(currentStock.currentPrice)}</span>
                </div>
              )}
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
