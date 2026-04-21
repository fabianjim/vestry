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

function getNodeColor(sector: string | null | undefined) {
  if (!sector) return '#6b7280'
  return SECTOR_COLORS[sector] || '#6b7280'
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
    <div className="max-w-6xl mx-auto mt-6 px-3">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold m-0">Holding Analysis</h2>
        <button onClick={() => navigate('/dashboard')} className="px-3 py-2 bg-surface border border-border rounded-md hover:bg-surface-hover transition-colors">← Back to Dashboard</button>
      </div>

      {error && <div className="text-error mb-4">{error}</div>}

      <div className="mb-4 flex gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-muted inline-block"></span>
          <span className="text-sm text-muted">Holding (size = market value)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full border-2 border-muted bg-background inline-block"></span>
          <span className="text-sm text-muted">Watchlist</span>
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
