import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import HoldingGraph, { type GraphNode, type GraphEdge } from '../components/HoldingGraph'
import NodeDetailPanel from '../components/NodeDetailPanel'
import { portfolioApi, watchlistApi, stockApi } from '../services/api'
import type { StockMetadata } from '../types/watchlist'

type Holding = {
  ticker: string
  shares: number
  stockData?: {
    stock?: {
      currentPrice: number
    } | null
  } | null
}

type WatchlistItem = {
  id: number
  ticker: string
  metadata: StockMetadata | null
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

function getNodeColor(sector: string | null | undefined) {
  if (!sector) return '#6c757d'
  return SECTOR_COLORS[sector] || '#6c757d'
}

export default function Analysis() {
  const navigate = useNavigate()
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [error, setError] = useState('')
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Holding Analysis'
  }, [])

  const fetchData = async () => {
    setError('')
    try {
      const [holdingsRes, watchlistRes] = await Promise.all([
        portfolioApi.getHoldings() as Promise<Holding[]>,
        watchlistApi.getWatchlist() as Promise<WatchlistItem[]>,
      ])

      // For holdings, we need stock data to compute market value for sizing
      const holdingsWithData = await Promise.all(
        (holdingsRes || []).map(async (h) => {
          try {
            const data = (await stockApi.getStockData(h.ticker)) as { stock?: { currentPrice: number } | null }
            return { ...h, stockData: data }
          } catch {
            return h
          }
        })
      )

      setHoldings(holdingsWithData)
      setWatchlist(watchlistRes || [])
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unexpected error'
      setError(message)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const { nodes, edges } = useMemo(() => {
    const allNodes: GraphNode[] = []
    const allEdges: GraphEdge[] = []

    // Holding nodes
    holdings.forEach((h) => {
      const price = h.stockData?.stock?.currentPrice || 0
      const marketValue = h.shares * price
      // Scale radius between 12 and 40 based on market value
      const radius = Math.max(12, Math.min(40, 12 + Math.log10(marketValue + 1) * 4))
      const metadata = null // holdings don't have metadata directly; we'll match by ticker from watchlist if available
      allNodes.push({
        id: `holding-${h.ticker}`,
        ticker: h.ticker,
        type: 'holding',
        radius,
        color: getNodeColor(null),
        metadata,
      })
    })

    // Watchlist nodes
    watchlist.forEach((w) => {
      allNodes.push({
        id: `watchlist-${w.ticker}`,
        ticker: w.ticker,
        type: 'watchlist',
        radius: 18,
        color: getNodeColor(w.metadata?.sector),
        metadata: w.metadata,
      })
    })

    // Hydrate holding node colors/metadata from watchlist if same ticker exists there
    watchlist.forEach((w) => {
      const holdingNode = allNodes.find((n) => n.ticker === w.ticker && n.type === 'holding')
      if (holdingNode && w.metadata) {
        holdingNode.color = getNodeColor(w.metadata.sector)
        holdingNode.metadata = w.metadata
      }
    })

    // Compute edges based on shared metadata characteristics
    for (let i = 0; i < allNodes.length; i++) {
      for (let j = i + 1; j < allNodes.length; j++) {
        const a = allNodes[i]
        const b = allNodes[j]
        let shared = 0

        if (a.metadata?.sector && a.metadata.sector === b.metadata?.sector) shared++
        if (a.metadata?.country && a.metadata.country === b.metadata?.country) shared++
        if (a.metadata?.marketCapTier && a.metadata.marketCapTier === b.metadata?.marketCapTier) shared++

        if (shared > 0) {
          allEdges.push({
            source: a.id,
            target: b.id,
            strength: shared,
          })
        }
      }
    }

    return { nodes: allNodes, edges: allEdges }
  }, [holdings, watchlist])

  const selectedMetadata = useMemo(() => {
    if (!selectedTicker) return null
    const watchlistItem = watchlist.find((w) => w.ticker === selectedTicker)
    return watchlistItem?.metadata || null
  }, [selectedTicker, watchlist])

  return (
    <div style={{ maxWidth: 1200, margin: '24px auto', padding: '0 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Holding Analysis</h2>
        <button onClick={() => navigate('/dashboard')}>← Back to Dashboard</button>
      </div>

      {error && <div style={{ color: '#dc3545', marginBottom: 16 }}>{error}</div>}

      <div style={{ marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: '#6c757d', display: 'inline-block' }}></span>
          <span style={{ fontSize: 14, color: '#6c757d' }}>Holding (size = market value)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: '2px solid #6c757d',
              backgroundColor: 'white',
              display: 'inline-block',
            }}
          ></span>
          <span style={{ fontSize: 14, color: '#6c757d' }}>Watchlist</span>
        </div>
      </div>

      <HoldingGraph
        nodes={nodes}
        edges={edges}
        onNodeClick={(ticker) => setSelectedTicker(ticker)}
        width={1000}
        height={550}
      />

      {selectedTicker && (
        <NodeDetailPanel
          ticker={selectedTicker}
          metadata={selectedMetadata}
          onClose={() => setSelectedTicker(null)}
        />
      )}
    </div>
  )
}
