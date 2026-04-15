export type StockMetadata = {
  ticker: string
  name: string | null
  country: string | null
  sector: string | null
  industry: string | null
  marketCap: number | null
  marketCapTier: string | null
}

export type WatchlistItem = {
  id: number
  ticker: string
  metadata: StockMetadata | null
}
