import type { JournalEntry } from '../types/journal'

type ChartPoint = {
  time: string
  price: number
  fullTimestamp: string
}

export function findNearestChartPoint(
  entryTimestamp: string,
  chartData: ChartPoint[],
  toleranceMs = 24 * 60 * 60 * 1000
): ChartPoint | null {
  if (chartData.length === 0) return null

  const entryTime = new Date(entryTimestamp).getTime()
  let best: ChartPoint | null = null
  let bestDiff = Infinity

  for (const point of chartData) {
    const pointTime = new Date(point.fullTimestamp).getTime()
    const diff = Math.abs(entryTime - pointTime)
    if (diff < bestDiff) {
      bestDiff = diff
      best = point
    }
  }

  return bestDiff <= toleranceMs ? best : null
}

export function evaluateBuyPinOutcome(
  buyEntry: JournalEntry,
  allEntries: JournalEntry[],
  currentPrice: number
): 'gain' | 'loss' | 'neutral' {
  if (buyEntry.priceSnapshot == null) return 'neutral'

  const buyTime = new Date(buyEntry.timestamp).getTime()
  const nextSell = allEntries
    .filter((e) => e.entryType === 'SELL' && new Date(e.timestamp).getTime() > buyTime)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0]

  const comparePrice = nextSell?.priceSnapshot ?? currentPrice

  if (comparePrice == null) return 'neutral'
  if (comparePrice > buyEntry.priceSnapshot) return 'gain'
  if (comparePrice < buyEntry.priceSnapshot) return 'loss'
  return 'neutral'
}
