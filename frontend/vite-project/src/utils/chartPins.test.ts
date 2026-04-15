import { describe, it, expect } from 'vitest'
import { findNearestChartPoint, evaluateBuyPinOutcome } from './chartPins'
import type { JournalEntry } from '../types/journal'

type ChartPoint = {
  time: string
  price: number
  fullTimestamp: string
}

describe('findNearestChartPoint', () => {
  const chartData: ChartPoint[] = [
    { time: 'Jan 1', price: 100, fullTimestamp: '2025-01-01T00:00:00Z' },
    { time: 'Jan 2', price: 110, fullTimestamp: '2025-01-02T00:00:00Z' },
    { time: 'Jan 3', price: 120, fullTimestamp: '2025-01-03T00:00:00Z' },
  ]

  it('finds exact match', () => {
    const result = findNearestChartPoint('2025-01-02T00:00:00Z', chartData)
    expect(result).toEqual(chartData[1])
  })

  it('finds closest point within tolerance', () => {
    const result = findNearestChartPoint('2025-01-02T12:00:00Z', chartData)
    expect(result).toEqual(chartData[1])
  })

  it('returns null when outside tolerance', () => {
    const result = findNearestChartPoint('2025-01-10T00:00:00Z', chartData)
    expect(result).toBeNull()
  })

  it('returns null for empty chart data', () => {
    const result = findNearestChartPoint('2025-01-01T00:00:00Z', [])
    expect(result).toBeNull()
  })
})

describe('evaluateBuyPinOutcome', () => {
  const createEntry = (id: number, type: string, timestamp: string, priceSnapshot: number | null): JournalEntry => ({
    id,
    entryType: type as JournalEntry['entryType'],
    body: '',
    ticker: 'AAPL',
    timestamp,
    priceSnapshot,
  })

  it('gain when next sell price is higher', () => {
    const buy = createEntry(1, 'BUY', '2025-01-01T00:00:00Z', 100)
    const sell = createEntry(2, 'SELL', '2025-01-02T00:00:00Z', 150)
    expect(evaluateBuyPinOutcome(buy, [sell], 200)).toBe('gain')
  })

  it('loss when next sell price is lower', () => {
    const buy = createEntry(1, 'BUY', '2025-01-01T00:00:00Z', 150)
    const sell = createEntry(2, 'SELL', '2025-01-02T00:00:00Z', 100)
    expect(evaluateBuyPinOutcome(buy, [sell], 200)).toBe('loss')
  })

  it('uses current price when no sell exists', () => {
    const buy = createEntry(1, 'BUY', '2025-01-01T00:00:00Z', 100)
    expect(evaluateBuyPinOutcome(buy, [], 150)).toBe('gain')
    expect(evaluateBuyPinOutcome(buy, [], 50)).toBe('loss')
  })

  it('neutral when price snapshot is missing', () => {
    const buy = createEntry(1, 'BUY', '2025-01-01T00:00:00Z', null)
    expect(evaluateBuyPinOutcome(buy, [], 150)).toBe('neutral')
  })

  it('ignores sell that happened before buy', () => {
    const buy = createEntry(1, 'BUY', '2025-01-02T00:00:00Z', 100)
    const sell = createEntry(2, 'SELL', '2025-01-01T00:00:00Z', 150)
    expect(evaluateBuyPinOutcome(buy, [sell], 200)).toBe('gain')
  })
})
