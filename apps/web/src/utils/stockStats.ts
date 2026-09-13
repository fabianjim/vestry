import type { StockHistoryPoint } from '../types/stock'
import type { JournalEntry } from '../types/journal'
import type { Transaction } from '../types/transaction'

export type WeekRange = {
  high: number
  low: number
}

export type EntryTiming = {
  percent: number
}

export type ExitTiming = {
  percent: number
}

export type PriceMovement = {
  price: number
  diff: number
  percent: number
}

export function getPriceChange(initialPrice: number | null, latestPrice: number | null): PriceMovement | null {
  if (initialPrice == null || latestPrice == null || initialPrice <= 0 || latestPrice <= 0
    || !Number.isFinite(initialPrice) || !Number.isFinite(latestPrice)) return null
  const diff = latestPrice - initialPrice
  return { price: latestPrice, diff, percent: diff / initialPrice * 100 }
}

export function getRecordedRangeSinceEntry(timestamp: string, history: StockHistoryPoint[]) {
  const points = getPostEntryHistory(timestamp, history)
    .filter((point) => Number.isFinite(point.currentPrice) && point.currentPrice > 0)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  if (!points.length) return null
  let lowest = points[0]
  let highest = points[0]
  for (const point of points) {
    if (point.currentPrice < lowest.currentPrice) lowest = point
    if (point.currentPrice > highest.currentPrice) highest = point
  }
  return {
    lowest: { price: lowest.currentPrice, timestamp: lowest.timestamp },
    highest: { price: highest.currentPrice, timestamp: highest.timestamp },
  }
}

export function getWeekBounds(timestamp: string): { start: Date; end: Date } {
  const entryDate = new Date(timestamp)
  const day = entryDate.getDay()
  const diffToMonday = (day + 6) % 7
  const weekStart = new Date(entryDate)
  weekStart.setDate(entryDate.getDate() - diffToMonday)
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 7)
  return { start: weekStart, end: weekEnd }
}

export function getWeekRange(
  timestamp: string,
  history: StockHistoryPoint[]
): WeekRange | null {
  const { start, end } = getWeekBounds(timestamp)

  const weekPoints = history.filter((point) => {
    const ts = new Date(point.timestamp).getTime()
    return ts >= start.getTime() && ts < end.getTime()
  })

  if (!weekPoints.length) return null

  const high = Math.max(...weekPoints.map((p) => p.high))
  const low = Math.min(...weekPoints.map((p) => p.low))
  return { high, low }
}

export function getEntryTimingPercent(
  entryPrice: number,
  timestamp: string,
  history: StockHistoryPoint[]
): number | null {
  const weekRange = getWeekRange(timestamp, history)
  if (!weekRange || weekRange.low <= 0) return null
  return ((entryPrice - weekRange.low) / weekRange.low) * 100
}

export function getExitTimingPercent(
  exitPrice: number,
  timestamp: string,
  history: StockHistoryPoint[]
): number | null {
  const weekRange = getWeekRange(timestamp, history)
  if (!weekRange || weekRange.high <= 0) return null
  return ((weekRange.high - exitPrice) / weekRange.high) * 100
}

export function getPostEntryHistory(
  timestamp: string,
  history: StockHistoryPoint[]
): StockHistoryPoint[] {
  const entryTime = new Date(timestamp).getTime()
  return history.filter((point) => new Date(point.timestamp).getTime() >= entryTime)
}

export function getPeakSinceEntry(
  entryPrice: number,
  timestamp: string,
  history: StockHistoryPoint[]
): PriceMovement | null {
  const postEntryHistory = getPostEntryHistory(timestamp, history)
  if (!postEntryHistory.length) return null

  const peakPrice = Math.max(...postEntryHistory.map((point) => point.high))
  const diff = peakPrice - entryPrice
  const percent = (diff / entryPrice) * 100
  return { price: peakPrice, diff, percent }
}

export function getDrawdownSinceEntry(
  entryPrice: number,
  timestamp: string,
  history: StockHistoryPoint[]
): PriceMovement | null {
  const postEntryHistory = getPostEntryHistory(timestamp, history)
  if (!postEntryHistory.length) return null

  const troughPrice = Math.min(...postEntryHistory.map((point) => point.low))
  const diff = troughPrice - entryPrice
  const percent = (diff / entryPrice) * 100
  return { price: troughPrice, diff, percent }
}

export function getDriftSinceExit(
  exitPrice: number,
  currentPrice: number
): PriceMovement {
  const diff = currentPrice - exitPrice
  const percent = (diff / exitPrice) * 100
  return { price: currentPrice, diff, percent }
}

export function matchJournalTransaction(
  entry: Pick<JournalEntry, 'ticker' | 'entryType' | 'timestamp'>,
  transactions: Transaction[]
): Transaction | null {
  if (!entry.ticker || (entry.entryType !== 'BUY' && entry.entryType !== 'SELL')) return null

  const entryTime = new Date(entry.timestamp).getTime()
  let nearest: Transaction | null = null
  let nearestDistance = Infinity
  for (const tx of transactions) {
    if (tx.ticker !== entry.ticker || tx.type !== entry.entryType) continue
    const distance = Math.abs(new Date(tx.timestamp).getTime() - entryTime)
    if (distance <= 5 * 60 * 1000 && distance < nearestDistance) {
      nearest = tx
      nearestDistance = distance
    }
  }
  return nearest
}

export function getRealizedPnLForSell(
  sale: Transaction,
  transactions: Transaction[]
): { realizedPnL: number; realizedPercent: number; avgCost: number } | null {
  if (sale.type !== 'SELL') return null
  const history = transactions.filter((tx) => tx.ticker === sale.ticker)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  let shares = 0
  let costBasis = 0
  // Stop at this sale so subsequent purchases cannot change its result.
  for (const tx of history) {
    if (tx.type === 'BUY') {
      shares += tx.shares
      costBasis += tx.totalValue
    } else {
      if (shares <= 0 || tx.shares > shares + 1e-9) return null
      const avgCost = costBasis / shares
      const saleCost = avgCost * tx.shares
      if (tx.id === sale.id) {
        const realizedPnL = tx.totalValue - saleCost
        const realizedPercent = saleCost > 0 ? realizedPnL / saleCost * 100 : 0
        return { realizedPnL, realizedPercent, avgCost }
      }
      shares -= tx.shares
      costBasis -= saleCost
      if (Math.abs(shares) < 1e-9) {
        shares = 0
        costBasis = 0
      }
    }
  }
  return null
}

export function getCurrentWeekRange(history: StockHistoryPoint[]): WeekRange | null {
  const now = new Date()
  const day = now.getDay()
  const diffToMonday = (day + 6) % 7
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - diffToMonday)
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 7)

  const weekPoints = history.filter((point) => {
    const ts = new Date(point.timestamp).getTime()
    return ts >= weekStart.getTime() && ts < weekEnd.getTime()
  })

  if (!weekPoints.length) return null

  const high = Math.max(...weekPoints.map((p) => p.high))
  const low = Math.min(...weekPoints.map((p) => p.low))
  return { high, low }
}

export function getTrailingRange(
  days: number,
  history: StockHistoryPoint[]
): WeekRange | null {
  const now = new Date()
  const start = new Date(now)
  start.setDate(now.getDate() - days)
  start.setHours(0, 0, 0, 0)

  const trailingPoints = history.filter((point) => {
    const ts = new Date(point.timestamp).getTime()
    return ts >= start.getTime()
  })

  if (!trailingPoints.length) return null

  const high = Math.max(...trailingPoints.map((p) => p.high))
  const low = Math.min(...trailingPoints.map((p) => p.low))
  return { high, low }
}
