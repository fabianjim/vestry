import type { JournalEntry } from '../types/journal'
import type { StockHistoryPoint } from '../types/stock'
import { marketDateKey } from './calendarSelection'

const dateLabel = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })
const timeLabel = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })
export const formatPriceHistoryDate = (time: number, intraday = false) => (intraday ? timeLabel : dateLabel).format(time)

/** Latest observation per New York day, plus entry snapshots at their exact times. */
export function buildPriceHistory(history: StockHistoryPoint[], snapshots: (JournalEntry | null | undefined)[] = []) {
  if (!history.length) return []
  const valid = (point: { time: number; price: number }) => Number.isFinite(point.time) && Number.isFinite(point.price) && point.price > 0
  const daily = new Map<string, { time: number; price: number }>()
  history.map(point => ({ time: Date.parse(point.timestamp), price: point.currentPrice }))
    .filter(valid).sort((a, b) => a.time - b.time)
    .forEach(point => daily.set(marketDateKey(new Date(point.time)), point))
  const points = new Map([...daily.values()].map(point => [point.time, point]))
  for (const snapshot of snapshots) {
    if (snapshot?.priceSnapshot == null) continue
    const point = { time: Date.parse(snapshot.timestamp), price: snapshot.priceSnapshot }
    if (valid(point)) points.set(point.time, point)
  }
  return [...points.values()].sort((a, b) => a.time - b.time)
}
