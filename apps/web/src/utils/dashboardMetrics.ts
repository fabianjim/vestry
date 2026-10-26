import type { PnLSummary, Transaction } from '../types/transaction'
import { formatShortMarketDay, type PerformancePoint } from './chartData'
import { marketDay } from './dateUtils'
import type { DashboardMetric } from './dashboardLayout'
import { concentrationSummary, holdingPrice, type ValuedHolding } from './holdingsAnalysis'

export type SummaryMetric = {
  value: number | null
  format: 'money' | 'change' | 'percent' | 'count'
  percent?: number
  detail?: string
}

export type TradeHistory = { timeline: PerformancePoint[]; transactions: Transaction[] }

const MINUTE = 60_000

/**
 * How the total gain has moved since the latest trade, from the first point that includes it,
 * so the money the trade moved never counts as gain.
 */
export function sinceLastTrade({ timeline, transactions }: TradeHistory): { amount: number; percent: number; day: string } | null {
  if (transactions.length === 0) return null
  const traded = Math.max(...transactions.map(tx => new Date(tx.timestamp).getTime()))
  const from = timeline.find(point => point.time >= Math.floor(traded / MINUTE) * MINUTE)
  const latest = timeline[timeline.length - 1]
  if (!from || !latest) return null
  const amount = (latest.value - latest.invested) - (from.value - from.invested)
  return { amount, percent: from.value > 0 ? amount / from.value * 100 : 0, day: marketDay(traded) }
}

export function dashboardMetrics(holdings: ValuedHolding[], pnl?: PnLSummary, ready = true, trades?: TradeHistory): Record<DashboardMetric, SummaryMetric> {
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
  const sinceTrade = trades && sinceLastTrade(trades)
  const latestDay = trades?.timeline[trades.timeline.length - 1]?.day
  return {
    value: { value, format: 'money' },
    'day-change': change(dayChange ?? undefined, previous != null && previous > 0 ? dayChange! / previous * 100 : 0),
    'total-pnl': change(priced ? pnl?.totalPnL : undefined, pnl?.totalPnLPercent),
    'unrealized-pnl': change(priced ? pnl?.unrealizedPnL : undefined, pnl?.unrealizedPnLPercent),
    'realized-pnl': change(pnl?.realizedPnL, pnl?.realizedPnLPercent),
    'holding-count': { value: ready ? holdings.length : null, format: 'count' },
    'largest-weight': { value: priced ? concentration.largest?.weight ?? null : null, format: 'percent',
      detail: priced ? concentration.largest?.ticker : undefined },
    'since-last-trade': { ...change(sinceTrade?.amount, sinceTrade?.percent),
      detail: sinceTrade && latestDay ? formatShortMarketDay(sinceTrade.day, latestDay) : undefined },
  }
}
