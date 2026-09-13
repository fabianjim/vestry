export type PositionStats = {
  shares: number
  averageCost: number | null
  marketValue: number | null
  unrealizedGainLoss: number | null
  unrealizedPercent: number | null
  realizedGainLoss: number
  realizedPercent: number
}
