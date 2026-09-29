import type { Holding } from '../types/portfolio'
import type { JournalEntry } from '../types/journal'
import type { StockData } from '../types/stock'
import type { Transaction } from '../types/transaction'
import { getPositionStats } from './positionStats'

export type ValuedHolding = Holding & { stockData?: StockData }

export function holdingPrice(holding: ValuedHolding): number | null {
  const price = holding.stockData?.stock?.currentPrice
  return price != null && Number.isFinite(price) && price > 0 ? price : null
}

export function concentrationSummary(holdings: ValuedHolding[], requestedTopN = 3) {
  const values = holdings.flatMap(holding => {
    const price = holdingPrice(holding)
    return price === null ? [] : [{ ticker: holding.ticker, value: holding.shares * price }]
  }).filter(row => Number.isFinite(row.value) && row.value > 0)
    .sort((a, b) => b.value - a.value || a.ticker.localeCompare(b.ticker))
  const total = values.reduce((sum, item) => sum + item.value, 0)
  let cumulativeValue = 0
  const rows = values.map((row, index) => {
    cumulativeValue += row.value
    return { ...row, rank: index + 1, weight: row.value / total * 100,
      cumulativeValue, cumulativeWeight: cumulativeValue / total * 100 }
  })
  const topN = Math.min(rows.length, Math.max(1, Number.isFinite(requestedTopN) ? Math.floor(requestedTopN) : 3))
  const selected = rows[topN - 1]
  return {
    rows,
    missing: holdings.length - values.length,
    topN,
    topWeight: selected?.cumulativeWeight ?? null,
    topValue: selected?.cumulativeValue ?? null,
    largest: rows[0] ?? null,
    effectiveHoldings: total > 0 ? 1 / rows.reduce((sum, row) => sum + (row.weight / 100) ** 2, 0) : null,
  }
}

export function positionSizeReturn(holdings: ValuedHolding[], transactions: Transaction[]) {
  const summary = concentrationSummary(holdings)
  const points = summary.rows.flatMap(row => {
    const holding = holdings.find(item => item.ticker === row.ticker)!
    const stats = getPositionStats(transactions, row.ticker, holdingPrice(holding))
    if (!stats || stats.averageCost == null || stats.averageCost <= 0 || stats.unrealizedPercent == null
        || !Number.isFinite(stats.unrealizedPercent)) return []
    return [{ ticker: row.ticker, weight: row.weight, returnPercent: stats.unrealizedPercent }]
  })
  return { points, missingPrices: summary.missing, missingReturns: summary.rows.length - points.length }
}

export function reflectionOverview(holdings: Holding[], entries: JournalEntry[]) {
  const latest = new Map<string, JournalEntry>()
  for (const entry of entries) {
    if (!entry.ticker || !['INSIGHT', 'REFLECTION'].includes(entry.entryType)) continue
    const previous = latest.get(entry.ticker)
    if (!previous || new Date(entry.timestamp).getTime() > new Date(previous.timestamp).getTime()) {
      latest.set(entry.ticker, entry)
    }
  }
  return holdings.map(({ ticker }) => ({ ticker, entry: latest.get(ticker) ?? null }))
    .sort((a, b) => {
      if (!a.entry && !b.entry) return a.ticker.localeCompare(b.ticker)
      if (!a.entry) return -1
      if (!b.entry) return 1
      return new Date(a.entry.timestamp).getTime() - new Date(b.entry.timestamp).getTime()
    })
}

export function holdingPnl(holdings: ValuedHolding[], transactions: Transaction[], realized: boolean) {
  const tickers = realized
    ? [...new Set(transactions.filter(tx => tx.type === 'SELL').map(tx => tx.ticker))]
    : holdings.map(h => h.ticker)
  return tickers.map(ticker => {
    const holding = holdings.find(h => h.ticker === ticker)
    const stats = getPositionStats(transactions, ticker, holding ? holdingPrice(holding) : null)
    return {
      ticker,
      value: (realized ? stats?.realizedGainLoss : stats?.unrealizedGainLoss) ?? null,
      percent: (realized ? stats?.realizedPercent : stats?.unrealizedPercent) ?? null,
    }
  }).sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
}
