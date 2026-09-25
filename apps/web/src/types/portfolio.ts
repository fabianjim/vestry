import type { StockMetadata } from './watchlist'

export type Holding = {
  ticker: string
  shares: number
  buyTimestamp?: string | null
  metadata?: StockMetadata | null
}

export type PortfolioHistoryPoint = {
  timestamp: string
  portfolioValue: number
}
