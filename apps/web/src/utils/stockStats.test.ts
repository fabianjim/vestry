import { describe, expect, it } from 'vitest'
import type { Transaction } from '../types/transaction'
import { getPriceChange, getRecordedRangeSinceEntry, getRealizedPnLForSell, matchJournalTransaction } from './stockStats'

const tx = (id: number, type: Transaction['type'], shares: number, price: number): Transaction => ({
  id, type, shares, price, ticker: 'AAPL', totalValue: shares * price,
  timestamp: `2026-01-0${Math.abs(id)}T15:00:00Z`,
})

describe('journal price metrics', () => {
  it('reports per-share price changes, including unchanged prices', () => {
    expect(getPriceChange(100, 120)).toEqual({ price: 120, diff: 20, percent: 20 })
    expect(getPriceChange(100, 90)).toEqual({ price: 90, diff: -10, percent: -10 })
    expect(getPriceChange(100, 100)).toEqual({ price: 100, diff: 0, percent: 0 })
  })

  it('keeps missing or invalid prices unavailable', () => {
    expect(getPriceChange(null, 100)).toBeNull()
    expect(getPriceChange(100, null)).toBeNull()
    expect(getPriceChange(0, 100)).toBeNull()
    expect(getPriceChange(100, NaN)).toBeNull()
  })

  const point = (timestamp: string, currentPrice: number) => ({
    timestamp, currentPrice, high: 1000, low: 1, open: 100, prevClose: 100,
  })

  it('uses recorded prices after the entry, preserving dates across years', () => {
    const history = [
      point('2026-01-01T16:00:00Z', 120), point('2025-12-31T15:00:00Z', 90),
      point('2025-12-31T14:59:59Z', 200), point('2026-01-02T15:00:00Z', 90),
    ]
    const original = [...history]
    expect(getRecordedRangeSinceEntry('2025-12-31T15:00:00Z', history)).toEqual({
      lowest: { price: 90, timestamp: '2025-12-31T15:00:00Z' },
      highest: { price: 120, timestamp: '2026-01-01T16:00:00Z' },
    })
    expect(history).toEqual(original)
  })

  it('returns unavailable without valid subsequent observations', () => {
    expect(getRecordedRangeSinceEntry('2026-01-01T00:00:00Z', [])).toBeNull()
    expect(getRecordedRangeSinceEntry('2026-01-01T00:00:00Z', [
      point('2025-12-31T15:00:00Z', 100), point('2026-01-01T15:00:00Z', 0),
      point('2026-01-01T16:00:00Z', NaN),
    ])).toBeNull()
  })
})

describe('getRealizedPnLForSell', () => {
  it('excludes later purchases and returns only the selected sale result', () => {
    const firstSale = tx(2, 'SELL', 4, 150)
    const secondSale = tx(4, 'SELL', 5, 160)
    const history = [secondSale, tx(3, 'BUY', 4, 200), firstSale, tx(1, 'BUY', 10, 100)]
    const original = [...history]
    expect(getRealizedPnLForSell(firstSale, history)).toEqual({ realizedPnL: 200, realizedPercent: 50, avgCost: 100 })
    const result = getRealizedPnLForSell(secondSale, history)!
    expect(result.realizedPnL).toBe(100)
    expect(result.avgCost).toBe(140)
    expect(result.realizedPercent).toBeCloseTo(100 / 7)
    expect(history).toEqual(original)
  })

  it('uses the new cost basis after reopening a demo position', () => {
    const sale = tx(-4, 'SELL', 2, 180)
    const history = [sale, tx(-3, 'BUY', 5, 200), tx(-2, 'SELL', 10, 150), tx(-1, 'BUY', 10, 100)]
    expect(getRealizedPnLForSell(sale, history)).toEqual({ realizedPnL: -40, realizedPercent: -10, avgCost: 200 })
  })

  it('clears fractional cost residue before a repurchase', () => {
    const sale = tx(5, 'SELL', 0.1, 180)
    const result = getRealizedPnLForSell(sale, [
      tx(1, 'BUY', 0.3, 100), tx(2, 'SELL', 0.1, 120), tx(3, 'SELL', 0.2, 130),
      tx(4, 'BUY', 0.1, 200), sale,
    ])!
    expect(result.realizedPnL).toBeCloseTo(-2)
    expect(result.avgCost).toBeCloseTo(200)
  })

  it('returns unavailable for a missing sale or cost basis', () => {
    const sale = tx(2, 'SELL', 4, 150)
    expect(getRealizedPnLForSell(sale, [])).toBeNull()
    expect(getRealizedPnLForSell(sale, [sale, { ...tx(1, 'BUY', 10, 100), ticker: 'MSFT' }])).toBeNull()
    expect(getRealizedPnLForSell(tx(1, 'BUY', 10, 100), [tx(1, 'BUY', 10, 100)])).toBeNull()
  })
})

describe('matchJournalTransaction', () => {
  const entry = { ticker: 'AAPL', entryType: 'SELL' as const, timestamp: '2026-01-02T15:00:00Z' }

  it('selects the nearest trade with the same ticker and type', () => {
    const near = { ...tx(-2, 'SELL', 4, 150), timestamp: '2026-01-02T15:00:30Z' }
    const history = [
      { ...near, id: -3, timestamp: '2026-01-02T14:56:00Z' },
      { ...near, id: -4, type: 'BUY' as const, timestamp: entry.timestamp },
      { ...near, id: -5, ticker: 'MSFT', timestamp: entry.timestamp }, near,
    ]
    const original = [...history]
    expect(matchJournalTransaction(entry, history)).toBe(near)
    expect(history).toEqual(original)
  })

  it('includes the five-minute boundary and excludes trades beyond it', () => {
    const boundary = { ...tx(2, 'SELL', 4, 150), timestamp: '2026-01-02T15:05:00Z' }
    expect(matchJournalTransaction(entry, [boundary])).toBe(boundary)
    expect(matchJournalTransaction(entry, [{ ...boundary, timestamp: '2026-01-02T15:05:01Z' }])).toBeNull()
    expect(matchJournalTransaction(entry, [])).toBeNull()
  })

  it('does not attach trades to notes or entries without a ticker', () => {
    const history = [tx(2, 'SELL', 4, 150)]
    expect(matchJournalTransaction({ ...entry, entryType: 'INSIGHT' }, history)).toBeNull()
    expect(matchJournalTransaction({ ...entry, entryType: 'MARKET_EVENT' }, history)).toBeNull()
    expect(matchJournalTransaction({ ...entry, ticker: null }, history)).toBeNull()
  })
})
