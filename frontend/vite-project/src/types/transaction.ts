export type Transaction = {
  id: number
  ticker: string
  shares: number
  price: number
  totalValue: number
  type: 'BUY' | 'SELL'
  timestamp: string
}
