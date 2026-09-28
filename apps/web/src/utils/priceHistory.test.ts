import { describe, expect, it } from 'vitest'
import type { JournalEntry, JournalEntryType } from '../types/journal'
import type { StockHistoryPoint } from '../types/stock'
import { formatPriceHistoryDate, buildPriceHistory } from './priceHistory'

const quote = (timestamp: string, currentPrice: number): StockHistoryPoint => ({
  timestamp, currentPrice, open: currentPrice, high: currentPrice, low: currentPrice, prevClose: currentPrice,
})
const entry = (timestamp: string, priceSnapshot: number, entryType: JournalEntryType = 'INSIGHT'): JournalEntry => ({
  id: 1, timestamp, priceSnapshot, entryType, ticker: 'AAPL', body: '', tags: [],
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
