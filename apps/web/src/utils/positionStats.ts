import type { Transaction } from '../types/transaction'
import type { PositionStats } from '../types/position'

export function getPositionStats(
  transactions: Transaction[], ticker: string, currentPrice: number | null,
): PositionStats | null {
  const history = transactions.filter((tx) => tx.ticker === ticker)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  if (!history.length) return null

  let shares = 0
  let costBasis = 0
  let realizedGainLoss = 0
  let soldCostBasis = 0
  // Match the chronological average-cost calculation used by the portfolio summary.
  for (const tx of history) {
    if (tx.type === 'BUY') {
      shares += tx.shares
      costBasis += tx.totalValue
    } else if (shares > 0) {
      const saleCost = (costBasis / shares) * tx.shares
      realizedGainLoss += tx.totalValue - saleCost
      soldCostBasis += saleCost
      shares -= tx.shares
      costBasis -= saleCost
      if (Math.abs(shares) < 1e-9) {
        shares = 0
        costBasis = 0
      }
    }
  }

  const marketValue = shares === 0 ? 0 : currentPrice == null ? null : currentPrice * shares
  const unrealizedGainLoss = marketValue == null ? null : marketValue - costBasis
  return {
    shares,
    averageCost: shares > 0 ? costBasis / shares : null,
    marketValue,
    unrealizedGainLoss,
    unrealizedPercent: unrealizedGainLoss == null ? null : costBasis > 0 ? unrealizedGainLoss / costBasis * 100 : 0,
    realizedGainLoss,
    realizedPercent: soldCostBasis > 0 ? realizedGainLoss / soldCostBasis * 100 : 0,
  }
}
