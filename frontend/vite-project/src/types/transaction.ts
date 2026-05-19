export type Transaction = {
  id: number
  ticker: string
  shares: number
  price: number
  totalValue: number
  type: 'BUY' | 'SELL'
  timestamp: string
}

export type PnLSummary = {
  totalPnL: number
  totalPnLPercent: number
  unrealizedPnL: number
  unrealizedPnLPercent: number
  realizedPnL: number
  realizedPnLPercent: number
}
