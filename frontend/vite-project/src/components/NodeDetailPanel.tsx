import { useEffect, useState, useMemo, useRef } from 'react'
import {
  ComposedChart,
  Line,
  Scatter,
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
import { findNearestChartPoint, evaluateBuyPinOutcome } from '../utils/chartPins'

type NodeDetailPanelProps = {
  ticker: string
  metadata: StockMetadata | null
  onClose: () => void
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

type PinPoint = ChartPoint & {
  entryId: number
  entryType: JournalEntry['entryType']
  outcome: 'gain' | 'loss' | 'neutral'
}

type ScatterShapeProps = {
  cx?: number
  cy?: number
  payload?: PinPoint
}

const SECTOR_COLORS: Record<string, string> = {
  Technology: '#5e9ed6',
  'Health Care': '#10b981',
  Finance: '#f59e0b',
  Industrials: '#8b5cf6',
  'Consumer Discretionary': '#f97316',
  'Consumer Staples': '#14b8a6',
  'Communication Services': '#ec4899',
  Energy: '#ef4444',
  Materials: '#06b6d4',
  'Real Estate': '#a78bfa',
  Utilities: '#6b7280',
}

function CustomPin(props: ScatterShapeProps) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null || !payload) return null

  const size = 10
  const half = size / 2

  let fill = '#6b7280'
  const stroke = '#2d2d2d'

  if (payload.entryType === 'BUY') {
    fill = payload.outcome === 'gain' ? '#10b981' : payload.outcome === 'loss' ? '#ef4444' : '#5e9ed6'
  } else if (payload.entryType === 'SELL') {
    fill = '#f97316'
  } else if (payload.entryType === 'INSIGHT') {
    fill = '#8b5cf6'
  } else if (payload.entryType === 'MARKET_EVENT') {
    fill = '#6b7280'
  }

  // Shapes
  if (payload.entryType === 'BUY' && payload.outcome === 'gain') {
    return (
      <g transform={`translate(${cx},${cy})`}>
        <polygon points={`0,-${half} ${half},${half} -${half},${half}`} fill={fill} stroke={stroke} strokeWidth={1} />
      </g>
    )
  }
  if (payload.entryType === 'BUY' && payload.outcome === 'loss') {
    return (
      <g transform={`translate(${cx},${cy})`}>
        <polygon points={`0,${half} ${half},-${half} -${half},-${half}`} fill={fill} stroke={stroke} strokeWidth={1} />
      </g>
    )
  }
  if (payload.entryType === 'SELL') {
    return (
      <g transform={`translate(${cx},${cy})`}>
        <rect x={-half} y={-half} width={size} height={size} fill={fill} stroke={stroke} strokeWidth={1} />
      </g>
    )
  }
  if (payload.entryType === 'INSIGHT') {
    return (
      <g transform={`translate(${cx},${cy})`}>
        <polygon points={`0,-${half} ${half},0 0,${half} -${half},0`} fill={fill} stroke={stroke} strokeWidth={1} />
      </g>
    )
  }
  // Default circle for BUY neutral and MARKET_EVENT
  return (
    <g transform={`translate(${cx},${cy})`}>
      <circle r={half} fill={fill} stroke={stroke} strokeWidth={1} />
    </g>
  )
}

export default function NodeDetailPanel({ ticker, metadata, onClose }: NodeDetailPanelProps) {
  const [history, setHistory] = useState<StockHistoryPoint[]>([])
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [highlightedEntryId, setHighlightedEntryId] = useState<number | null>(null)
  const entryRefs = useRef<Record<number, HTMLDivElement | null>>({})

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [histData, journalData] = await Promise.all([
          stockApi.getHistoricalData(ticker) as Promise<StockHistoryPoint[]>,
          journalApi.getEntriesForTicker(ticker) as Promise<JournalEntry[]>,
        ])
        setHistory(histData || [])
        setJournalEntries(journalData || [])
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unexpected error'
        setError(message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [ticker])

  useEffect(() => {
    if (highlightedEntryId != null && entryRefs.current[highlightedEntryId]) {
      entryRefs.current[highlightedEntryId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlightedEntryId])

  const chartData: ChartPoint[] = useMemo(() => {
    if (!history || history.length === 0) return []
    return history
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((item) => ({
        time: new Date(item.timestamp).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        price: item.currentPrice,
        fullTimestamp: item.timestamp,
      }))
  }, [history])

  const currentPrice = useMemo(() => {
    if (chartData.length === 0) return 0
    return chartData[chartData.length - 1].price
  }, [chartData])

  const pinData: PinPoint[] = useMemo(() => {
    if (chartData.length === 0) return []
    const pins: PinPoint[] = []

    journalEntries.forEach((entry) => {
      const nearest = findNearestChartPoint(entry.timestamp, chartData)
      if (!nearest) return

      let outcome: PinPoint['outcome'] = 'neutral'
      if (entry.entryType === 'BUY') {
        outcome = evaluateBuyPinOutcome(entry, journalEntries, currentPrice)
      }

      pins.push({
        ...nearest,
        entryId: entry.id,
        entryType: entry.entryType,
        outcome,
      })
    })

    return pins
  }, [journalEntries, chartData, currentPrice])

  const lineColor = metadata?.sector ? SECTOR_COLORS[metadata.sector] || '#6b7280' : '#6b7280'

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value)
  }

  const handlePinClick = (entryId: number) => {
    setHighlightedEntryId(entryId)
  }

  return (
    <div className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-surface border-l border-border shadow-[-4px_0_12px_rgba(0,0,0,0.15)] z-[1200] p-6 overflow-y-auto">
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-2xl font-semibold m-0">{ticker}</h2>
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
            <span className="font-semibold">Sector:</span> {metadata.sector || '-'}
          </div>
          <div className="text-sm text-muted mb-1">
            <span className="font-semibold">Industry:</span> {metadata.industry || '-'}
          </div>
          <div className="text-sm text-muted mb-1">
            <span className="font-semibold">Country:</span> {metadata.country || '-'}
          </div>
          <div className="text-sm text-muted">
            <span className="font-semibold">Market Cap Tier:</span>{' '}
            {metadata.marketCapTier
              ? metadata.marketCapTier.replace('_', ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase())
              : '-'}
          </div>
        </div>
      )}

      {error && <div className="text-error mb-4">{error}</div>}

      <div className="mb-6">
        <h4 className="text-lg font-semibold mb-3">Price History</h4>
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
                  tickFormatter={(value) => `$${value}`}
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
                <Scatter
                  data={pinData}
                  dataKey="price"
                  fill="#8884d8"
                  shape={(props: ScatterShapeProps) => (
                    <g
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        if (props.payload) handlePinClick(props.payload.entryId)
                      }}
                    >
                      <CustomPin {...props} payload={props.payload} />
                    </g>
                  )}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div>
        <h4 className="text-lg font-semibold mb-3">Journal Entries</h4>
        {journalEntries.length === 0 ? (
          <div className="text-muted italic">No journal entries for {ticker}.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {journalEntries.map((entry) => (
              <div
                key={entry.id}
                ref={(el) => { entryRefs.current[entry.id] = el }}
                className={`p-3 rounded-md transition-colors ${
                  highlightedEntryId === entry.id
                    ? 'bg-primary/10 border-2 border-primary'
                    : 'bg-surface-hover border border-border'
                }`}
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
