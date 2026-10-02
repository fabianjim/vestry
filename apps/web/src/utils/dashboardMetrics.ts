import type { PnLSummary } from '../types/transaction'
import type { DashboardMetric } from './dashboardLayout'
import { concentrationSummary, holdingPrice, type ValuedHolding } from './holdingsAnalysis'

export type SummaryMetric = {
  value: number | null
  format: 'money' | 'change' | 'percent' | 'count'
  percent?: number
  detail?: string
}

export function dashboardMetrics(holdings: ValuedHolding[], pnl?: PnLSummary, ready = true): Record<DashboardMetric, SummaryMetric> {
  const concentration = concentrationSummary(holdings)
  const priced = ready && concentration.missing === 0
  const value = priced ? holdings.reduce((sum, holding) => sum + holding.shares * holdingPrice(holding)!, 0) : null
  const hasCloses = priced && holdings.every(holding => {
    const close = holding.stockData?.stock?.prevClose
    return close != null && Number.isFinite(close) && close > 0
  })
  const previous = hasCloses ? holdings.reduce((sum, holding) => sum + holding.shares * holding.stockData!.stock!.prevClose, 0) : null
  const dayChange = value != null && previous != null ? value - previous : null
  const change = (amount?: number, percent?: number): SummaryMetric => ({
    value: amount != null && Number.isFinite(amount) && percent != null && Number.isFinite(percent) ? amount : null,
    percent, format: 'change',
  })
  return {
    value: { value, format: 'money' },
    'day-change': change(dayChange ?? undefined, previous != null && previous > 0 ? dayChange! / previous * 100 : 0),
    'total-pnl': change(priced ? pnl?.totalPnL : undefined, pnl?.totalPnLPercent),
    'unrealized-pnl': change(priced ? pnl?.unrealizedPnL : undefined, pnl?.unrealizedPnLPercent),
    'realized-pnl': change(pnl?.realizedPnL, pnl?.realizedPnLPercent),
    'holding-count': { value: ready ? holdings.length : null, format: 'count' },
    'largest-weight': { value: priced ? concentration.largest?.weight ?? null : null, format: 'percent',
      detail: priced ? concentration.largest?.ticker : undefined },
  }
}
