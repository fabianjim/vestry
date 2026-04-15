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
  Technology: '#007bff',
  'Health Care': '#28a745',
  Finance: '#ffc107',
  Industrials: '#6f42c1',
  'Consumer Discretionary': '#fd7e14',
  'Consumer Staples': '#20c997',
  'Communication Services': '#e83e8c',
  Energy: '#dc3545',
  Materials: '#17a2b8',
  'Real Estate': '#795548',
  Utilities: '#6c757d',
}

function CustomPin(props: ScatterShapeProps) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null || !payload) return null

  const size = 10
  const half = size / 2

  let fill = '#6c757d'
  const stroke = '#333'

  if (payload.entryType === 'BUY') {
    fill = payload.outcome === 'gain' ? '#28a745' : payload.outcome === 'loss' ? '#dc3545' : '#007bff'
  } else if (payload.entryType === 'SELL') {
    fill = '#fd7e14'
  } else if (payload.entryType === 'INSIGHT') {
    fill = '#6f42c1'
  } else if (payload.entryType === 'MARKET_EVENT') {
    fill = '#adb5bd'
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

  const lineColor = metadata?.sector ? SECTOR_COLORS[metadata.sector] || '#6c757d' : '#6c757d'

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
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        maxWidth: 420,
        backgroundColor: 'white',
        borderLeft: '1px solid #dee2e6',
        boxShadow: '-4px 0 12px rgba(0,0,0,0.15)',
        zIndex: 1200,
        padding: 24,
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>{ticker}</h2>
        <button
          onClick={onClose}
          style={{
            padding: '6px 12px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>

      {metadata && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, color: '#6c757d', marginBottom: 4 }}>
            <strong>Sector:</strong> {metadata.sector || '-'}
          </div>
          <div style={{ fontSize: 14, color: '#6c757d', marginBottom: 4 }}>
            <strong>Industry:</strong> {metadata.industry || '-'}
          </div>
          <div style={{ fontSize: 14, color: '#6c757d', marginBottom: 4 }}>
            <strong>Country:</strong> {metadata.country || '-'}
          </div>
          <div style={{ fontSize: 14, color: '#6c757d' }}>
            <strong>Market Cap Tier:</strong>{' '}
            {metadata.marketCapTier
              ? metadata.marketCapTier.replace('_', ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase())
              : '-'}
          </div>
        </div>
      )}

      {error && <div style={{ color: '#dc3545', marginBottom: 16 }}>{error}</div>}

      <div style={{ marginBottom: 24 }}>
        <h4 style={{ marginBottom: 12 }}>Price History</h4>
        {loading && chartData.length === 0 ? (
          <div style={{ color: '#6c757d' }}>Loading chart...</div>
        ) : chartData.length === 0 ? (
          <div style={{ color: '#6c757d' }}>No price history available.</div>
        ) : (
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
                <XAxis dataKey="time" stroke="#6c757d" fontSize={12} tickLine={false} />
                <YAxis
                  stroke="#6c757d"
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
                    backgroundColor: 'white',
                    border: '1px solid #dee2e6',
                    borderRadius: 4,
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
        <h4 style={{ marginBottom: 12 }}>Journal Entries</h4>
        {journalEntries.length === 0 ? (
          <div style={{ color: '#6c757d', fontStyle: 'italic' }}>No journal entries for {ticker}.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {journalEntries.map((entry) => (
              <div
                key={entry.id}
                ref={(el) => { entryRefs.current[entry.id] = el }}
                style={{
                  padding: 12,
                  backgroundColor: highlightedEntryId === entry.id ? '#e7f1ff' : '#f8f9fa',
                  borderRadius: 6,
                  border: highlightedEntryId === entry.id ? '2px solid #007bff' : '1px solid #dee2e6',
                  transition: 'background-color 0.2s, border 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      color:
                        entry.entryType === 'BUY'
                          ? '#28a745'
                          : entry.entryType === 'SELL'
                          ? '#dc3545'
                          : entry.entryType === 'INSIGHT'
                          ? '#6f42c1'
                          : '#fd7e14',
                    }}
                  >
                    {entry.entryType.replace('_', ' ')}
                  </span>
                  <span style={{ fontSize: 11, color: '#6c757d' }}>{formatDateTime(entry.timestamp)}</span>
                </div>
                {entry.priceSnapshot != null && (
                  <div style={{ fontSize: 12, color: '#6c757d', marginBottom: 4 }}>
                    Snapshot: ${entry.priceSnapshot.toFixed(2)}
                  </div>
                )}
                <div style={{ fontSize: 14, color: '#495057', whiteSpace: 'pre-wrap' }}>{entry.body}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
