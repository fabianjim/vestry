import { useState, useEffect, useMemo } from 'react'
import { portfolioApi, watchlistApi, stockApi } from '../services/api'
import type { StockMetadata } from '../types/watchlist'
import type { StockSnapshot } from '../types/stock'
import { getNodeColor } from '../constants/colors'

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
    etf?: boolean
  } | null
}

export type GraphEdge = {
  source: string
  target: string
  strength: number
}

export type SectorBreakdownItem = {
  sector: string
  value: number
  percentage: number
  color: string
  etf: boolean
}

export type HoldingValueItem = {
  ticker: string
  value: number
  percentage: number
  color: string
  sector: string
}

type Holding = {
  ticker: string
  shares: number
  buyTimestamp?: string
  metadata: StockMetadata | null
  stockData?: {
    stock?: StockSnapshot | null
  } | null
}

type WatchlistItem = {
  id: number
  ticker: string
  metadata: StockMetadata | null
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
            const data = (await stockApi.getStockData(h.ticker)) as { stock?: StockSnapshot | null }
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

  const { nodes, edges, sectorData, holdingsValueData, totalValue } = useMemo(() => {
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

    // Compute breakdown data from holdings
    const breakdownHoldings = holdings
      .map((h) => {
        const price = h.stockData?.stock?.currentPrice || 0
        return {
          ticker: h.ticker,
          sector: h.metadata?.sector || 'Unknown',
          value: h.shares * price,
          etf: h.metadata?.etf ?? false,
        }
      })
      .filter((h) => h.value > 0)

    const totalValue = breakdownHoldings.reduce((sum, h) => sum + h.value, 0)

    // Sector aggregation
    const sectorMap = new Map<string, { value: number; etf: boolean }>()
    breakdownHoldings.forEach((h) => {
      const current = sectorMap.get(h.sector) || { value: 0, etf: false }
      sectorMap.set(h.sector, {
        value: current.value + h.value,
        etf: current.etf || h.etf,
      })
    })
    const sectorData: SectorBreakdownItem[] = Array.from(sectorMap.entries())
      .map(([sector, { value, etf }]) => ({
        sector,
        value,
        percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
        color: getNodeColor(sector),
        etf,
      }))
      .sort((a, b) => b.value - a.value)

    // Holdings sorted by value descending
    const holdingsValueData: HoldingValueItem[] = breakdownHoldings
      .map((h) => ({
        ticker: h.ticker,
        value: h.value,
        percentage: totalValue > 0 ? (h.value / totalValue) * 100 : 0,
        color: getNodeColor(h.sector),
        sector: h.sector,
      }))
      .sort((a, b) => b.value - a.value)

    return { nodes: allNodes, edges: allEdges, sectorData, holdingsValueData, totalValue }
  }, [holdings, watchlist])

  const getStockSnapshot = (ticker: string): StockSnapshot | null => {
    const holding = holdings.find((h) => h.ticker === ticker)
    return holding?.stockData?.stock ?? null
  }

  const getMetadata = (ticker: string) => {
    const holding = holdings.find((h) => h.ticker === ticker)
    if (holding?.metadata) return holding.metadata
    const watchlistItem = watchlist.find((w) => w.ticker === ticker)
    return watchlistItem?.metadata || null
  }

  const getTrackingStartDate = (ticker: string): string | null => {
    const holding = holdings.find((h) => h.ticker === ticker)
    return holding?.buyTimestamp ?? null
  }

  return { nodes, edges, sectorData, holdingsValueData, totalValue, error, getMetadata, getTrackingStartDate, getStockSnapshot, refetch: fetchData }
}
