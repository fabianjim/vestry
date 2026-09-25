export type StockHistoryPoint = {
  timestamp: string
  currentPrice: number
  open: number
  high: number
  low: number
  prevClose: number
}

export type StockSnapshot = {
  ticker: string
  timestamp: string
  currentPrice: number
  open: number
  high: number
  low: number
  prevClose: number
  type?: 'EOD' | 'INTRADAY' | 'INITIAL'
}

export type StockData = {
  stock: StockSnapshot | null
  stale: boolean
  staleWarning: string | null
  lastSuccessfulFetch: string | null
  eod: boolean
}
