import type { JournalEntry } from '../types/journal'
import type { StockHistoryPoint } from '../types/stock'
import { marketDateKey, marketDayBoundary } from './calendarSelection'

export type PriceHistoryRange = 'day' | 'week' | 'all'
type PriceHistoryPoint = { time: number; price: number }

/** Bound axis label work while retaining actual observation times and both endpoints. */
export function getPriceHistoryTicks(points: PriceHistoryPoint[]): number[] {
  const count = Math.min(5, points.length)
  return Array.from({ length: count }, (_, index) =>
    points[count === 1 ? 0 : Math.round(index * (points.length - 1) / (count - 1))].time)
}

const dateLabel = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })
const timeLabel = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })
export const formatPriceHistoryDate = (time: number, intraday = false) => (intraday ? timeLabel : dateLabel).format(time)

/** All keeps daily observations; Day/Week keep every observation, with exact-time snapshots. */
export function buildPriceHistory(
  history: StockHistoryPoint[],
  snapshots: (JournalEntry | null | undefined)[] = [],
  range: PriceHistoryRange = 'all',
  now = new Date(),
) {
  if (!history.length) return []
  let start = -Infinity
  if (range !== 'all') {
    const date = new Date(marketDateKey(now))
    if (range === 'week') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
    start = Date.parse(marketDayBoundary(date.toISOString().slice(0, 10)))
  }
  const end = range === 'all' ? Infinity : now.getTime()
  const valid = (point: PriceHistoryPoint) => Number.isFinite(point.time) && Number.isFinite(point.price)
    && point.price > 0 && point.time >= start && point.time <= end
  const observations = new Map<string | number, PriceHistoryPoint>()
  history.map(point => ({ time: Date.parse(point.timestamp), price: point.currentPrice }))
    .filter(valid).sort((a, b) => a.time - b.time)
    .forEach(point => observations.set(range === 'all' ? marketDateKey(new Date(point.time)) : point.time, point))
  const points = new Map([...observations.values()].map(point => [point.time, point]))
  for (const snapshot of snapshots) {
    if (snapshot?.priceSnapshot == null) continue
    const point = { time: Date.parse(snapshot.timestamp), price: snapshot.priceSnapshot }
    if (valid(point)) points.set(point.time, point)
  }
  return [...points.values()].sort((a, b) => a.time - b.time)
}

export function getPriceHistoryColor(points: PriceHistoryPoint[]): string {
  const change = points.length > 1 ? points[points.length - 1].price - points[0].price : 0
  return change > 0 ? 'var(--color-gain)' : change < 0 ? 'var(--color-loss)' : 'var(--color-primary)'
}
