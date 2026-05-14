import { useState, useEffect, useMemo } from 'react'
import { portfolioApi, watchlistApi, stockApi } from '../services/api'
import type { StockMetadata } from '../types/watchlist'

export type GraphNode = {
  id: string
  ticker: string
  type: 'holding' | 'watchlist'
  radius: number
  color: string
  metadata?: {
    sector?: string | null
    country?: string | null
    marketCapTier?: string | null
  } | null
}

export type GraphEdge = {
  source: string
  target: string
  strength: number
}

type Holding = {
  ticker: string
  shares: number
  metadata: StockMetadata | null
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

export function useHoldingGraphData() {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [error, setError] = useState('')

  const fetchData = async () => {
    setError('')
    try {
      const [holdingsRes, watchlistRes] = await Promise.all([
        portfolioApi.getHoldings() as Promise<Holding[]>,
        watchlistApi.getWatchlist() as Promise<WatchlistItem[]>,
      ])

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

    holdings.forEach((h) => {
      const price = h.stockData?.stock?.currentPrice || 0
      const marketValue = h.shares * price
      const radius = Math.max(10, Math.min(50, 10 + Math.log10(marketValue + 1) * 4))
      allNodes.push({
        id: `holding-${h.ticker}`,
        ticker: h.ticker,
        type: 'holding',
        radius,
        color: getNodeColor(h.metadata?.sector),
        metadata: h.metadata,
      })
    })

    watchlist.forEach((w) => {
      allNodes.push({
        id: `watchlist-${w.ticker}`,
        ticker: w.ticker,
        type: 'watchlist',
        radius: 10,
        color: getNodeColor(w.metadata?.sector),
        metadata: w.metadata,
      })
    })

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

  const getMetadata = (ticker: string) => {
    const holding = holdings.find((h) => h.ticker === ticker)
    if (holding?.metadata) return holding.metadata
    const watchlistItem = watchlist.find((w) => w.ticker === ticker)
    return watchlistItem?.metadata || null
  }

  return { nodes, edges, error, getMetadata, refetch: fetchData }
}
