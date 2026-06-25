import type { StockHistoryPoint } from '../types/stock'

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

export function getRealizedPnLForSell(
  sellShares: number,
  sellPrice: number,
  ticker: string,
  transactions: { ticker: string; type: 'BUY' | 'SELL'; shares: number; totalValue: number; initial?: boolean }[]
): { realizedPnL: number; realizedPercent: number; avgCost: number } {
  const tickerBuys = transactions.filter(
    (tx) => tx.ticker === ticker && tx.type === 'BUY' && !tx.initial
  )
  const totalBuyShares = tickerBuys.reduce((sum, tx) => sum + tx.shares, 0)
  const totalBuyCost = tickerBuys.reduce((sum, tx) => sum + tx.totalValue, 0)
  const avgCost = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0

  const realizedPnL = sellShares * (sellPrice - avgCost)
  const realizedPercent = avgCost > 0 ? ((sellPrice - avgCost) / avgCost) * 100 : 0

  return { realizedPnL, realizedPercent, avgCost }
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
