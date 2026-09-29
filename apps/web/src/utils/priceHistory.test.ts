import { describe, expect, it } from 'vitest'
import type { JournalEntry, JournalEntryType } from '../types/journal'
import type { StockHistoryPoint } from '../types/stock'
import { formatPriceHistoryDate, buildPriceHistory, getPriceHistoryColor, getPriceHistoryTicks } from './priceHistory'

const quote = (timestamp: string, currentPrice: number): StockHistoryPoint => ({
  timestamp, currentPrice, open: currentPrice, high: currentPrice, low: currentPrice, prevClose: currentPrice,
})
const entry = (timestamp: string, priceSnapshot: number, entryType: JournalEntryType = 'INSIGHT'): JournalEntry => ({
  id: 1, timestamp, priceSnapshot, entryType, ticker: 'AAPL', body: '', tags: [],
})

describe('price history ticks', () => {
  it('bounds long histories to five observation ticks including the endpoints without changing data', () => {
    const points = Array.from({ length: 1000 }, (_, index) => ({ time: index * 3600000, price: 100 }))
    const ticks = getPriceHistoryTicks(points)
    expect(ticks).toHaveLength(5)
    expect(ticks[0]).toBe(points[0].time)
    expect(ticks.at(-1)).toBe(points.at(-1)!.time)
    expect(new Set(ticks).size).toBe(5)
    expect(ticks.every(time => points.some(point => point.time === time))).toBe(true)
    expect(points).toHaveLength(1000)
  })

  it('retains every tick for short or empty histories', () => {
    for (const length of [0, 1, 2, 5]) {
      const points = Array.from({ length }, (_, time) => ({ time, price: 100 }))
      expect(getPriceHistoryTicks(points)).toEqual(points.map(point => point.time))
    }
  })
})

describe('price history periods', () => {
  const now = new Date('2026-09-29T20:00:00Z')

  it('shows every observation today in New York, filtering snapshots too', () => {
    const data = buildPriceHistory([
      quote('2026-09-29T02:00:00Z', 90), // Still yesterday in New York
      quote('2026-09-29T14:00:00Z', 100),
      quote('2026-09-29T15:00:00Z', 110),
      quote('2026-09-30T14:00:00Z', 120),
    ], [entry('2026-09-28T14:00:00Z', 80), entry('2026-09-29T14:30:00Z', 105)], 'day', now)
    expect(data.map(point => point.price)).toEqual([100, 105, 110])
  })

  it('starts the week on Monday and preserves intraday observations while All stays daily', () => {
    const history = [
      quote('2026-09-28T03:59:59Z', 80), // Sunday in New York
      quote('2026-09-28T04:00:00Z', 90),
      quote('2026-09-28T14:00:00Z', 100),
      quote('2026-09-29T14:00:00Z', 110),
    ]
    expect(buildPriceHistory(history, [], 'week', now).map(point => point.price)).toEqual([90, 100, 110])
    expect(buildPriceHistory(history, [], 'all', now).map(point => point.price)).toEqual([80, 100, 110])
  })

  it('handles New York daylight saving and a week spanning years', () => {
    expect(buildPriceHistory([
      quote('2026-11-01T03:59:59Z', 80),
      quote('2026-11-01T05:30:00Z', 90),
      quote('2026-11-01T06:30:00Z', 100),
    ], [], 'day', new Date('2026-11-01T20:00:00Z')).map(point => point.price)).toEqual([90, 100])
    expect(buildPriceHistory([
      quote('2025-12-29T04:59:59Z', 80),
      quote('2025-12-29T05:00:00Z', 90),
      quote('2026-01-01T15:00:00Z', 100),
    ], [], 'week', new Date('2026-01-01T20:00:00Z')).map(point => point.price)).toEqual([90, 100])
  })

  it('leaves periods without observations empty instead of showing an older day', () => {
    expect(buildPriceHistory([quote('2026-09-28T14:00:00Z', 100)], [], 'day', now)).toEqual([])
  })

  it('colors the visible change, with blue for flat or insufficient data', () => {
    const history = [quote('2026-09-28T14:00:00Z', 90), quote('2026-09-29T14:00:00Z', 110), quote('2026-09-29T15:00:00Z', 100)]
    expect(getPriceHistoryColor(buildPriceHistory(history, [], 'all', now))).toBe('var(--color-gain)')
    expect(getPriceHistoryColor(buildPriceHistory(history, [], 'day', now))).toBe('var(--color-loss)')
    expect(getPriceHistoryColor([{ time: 1, price: 100 }, { time: 2, price: 100 }])).toBe('var(--color-primary)')
    expect(getPriceHistoryColor([{ time: 1, price: 100 }])).toBe('var(--color-primary)')
    expect(getPriceHistoryColor([])).toBe('var(--color-primary)')
  })
})

describe('journal price history', () => {
  it.each<JournalEntryType>(['BUY', 'SELL', 'INSIGHT', 'MARKET_EVENT', 'REFLECTION'])('uses the same timeline for %s', type => {
    const history = [quote('2026-09-28T20:00:00Z', 110)]
    const snapshot = entry('2026-09-28T14:00:00Z', 100, type)
    expect(buildPriceHistory(history, [snapshot])).toEqual([
      { time: Date.parse(snapshot.timestamp), price: 100 },
      { time: Date.parse(history[0].timestamp), price: 110 },
    ])
    expect(history[0].currentPrice).toBe(110)
  })

  it('keeps the latest NY daily observation without merging different years', () => {
    const data = buildPriceHistory([
      quote('2026-09-29T02:00:00Z', 120), // September 28 in New York
      quote('2025-09-28T20:00:00Z', 80),
      quote('2026-09-28T20:00:00Z', 110),
      quote('2026-09-29T14:00:00Z', 130),
    ], [])
    expect(data.map(point => point.price)).toEqual([80, 120, 130])
  })

  it('preserves both reflection snapshots, including outside recorded days and exact-time overlap', () => {
    const original = entry('2026-09-27T14:00:00Z', 90, 'BUY')
    const reflection = entry('2026-09-28T20:00:00Z', 115, 'REFLECTION')
    expect(buildPriceHistory([quote(reflection.timestamp, 110)], [original, reflection])).toEqual([
      { time: Date.parse(original.timestamp), price: 90 },
      { time: Date.parse(reflection.timestamp), price: 115 },
    ])
  })

  it('keeps empty history empty and ignores invalid observations and snapshots', () => {
    expect(buildPriceHistory([], [entry('2026-09-28T14:00:00Z', 100)])).toEqual([])
    expect(buildPriceHistory([quote('invalid', 100), quote('2026-09-28T14:00:00Z', NaN)], [
      null, entry('invalid', 100), entry('2026-09-28T14:00:00Z', 0),
    ])).toEqual([])
  })

  it('formats tooltip dates without labels or years in New York time', () => {
    expect(formatPriceHistoryDate(Date.parse('2026-09-29T02:00:00Z'))).toBe('Sep 28')
    expect(formatPriceHistoryDate(Date.parse('2026-09-29T02:00:00Z'), true)).toBe('10:00 PM')
  })
})
