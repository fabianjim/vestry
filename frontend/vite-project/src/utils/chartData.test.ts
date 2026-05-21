import { describe, it, expect } from 'vitest'
import { processHourlyData } from './chartData'
import type { Transaction } from '../types/transaction'
import type { JournalEntry } from '../types/journal'

describe('processHourlyData', () => {
  // Use noon local time so toDateString() returns the expected date in any timezone
  const currentDate = new Date('2026-05-21T12:00:00')

  // Helper to create a history point at a specific LOCAL time during trading hours.
  // We use UTC timestamps; local time is UTC-4 (EDT), so add 4 hours.
  const makeHistory = (hour: number, minute: number, portfolioValue: number) => ({
    timestamp: `2026-05-21T${String(hour + 4).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
    portfolioValue,
  })

  // Helper to create a transaction at a specific LOCAL time
  const makeTx = (hour: number, minute: number, type: 'BUY' | 'SELL', totalValue: number): Transaction => ({
    id: 1,
    ticker: 'CAVA',
    type,
    shares: 1,
    price: totalValue,
    totalValue,
    timestamp: `2026-05-21T${String(hour + 4).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
  })

  it('compounds multiple buy/sell events in the same hour', () => {
    const history = [
      makeHistory(11, 0, 10009), // 11:00 AM fetch
    ]

    const transactions: Transaction[] = [
      makeTx(11, 11, 'BUY', 160),  // Buy at 11:11 -> 10009 + 160 = 10169
      makeTx(11, 58, 'BUY', 1926), // Buy at 11:58 -> 10169 + 1926 = 12095
      makeTx(11, 59, 'SELL', 417), // Sell at 11:59 -> 12095 - 417 = 11678
    ]

    const result = processHourlyData(history, transactions, [], currentDate)

    // Should have 4 points: 1 hourly fetch + 3 transactions
    expect(result).toHaveLength(4)

    // Verify chronological order (timestamps are UTC; local time is UTC-4)
    expect(result[0].timestamp).toBe(new Date('2026-05-21T15:00:00Z').getTime())
    expect(result[1].timestamp).toBe(new Date('2026-05-21T15:11:00Z').getTime())
    expect(result[2].timestamp).toBe(new Date('2026-05-21T15:58:00Z').getTime())
    expect(result[3].timestamp).toBe(new Date('2026-05-21T15:59:00Z').getTime())

    // Verify values compound correctly
    expect(result[0].value).toBe(10009)  // Original fetch
    expect(result[1].value).toBe(10169)  // 10009 + 160
    expect(result[2].value).toBe(12095)  // 10169 + 1926
    expect(result[3].value).toBe(11678)  // 12095 - 417

    // Verify transaction flags
    expect(result[0].isTransaction).toBe(false)
    expect(result[1].isTransaction).toBe(true)
    expect(result[2].isTransaction).toBe(true)
    expect(result[3].isTransaction).toBe(true)
  })

  it('applies transactions to previous hourly fetch when no prior transactions exist', () => {
    const history = [
      makeHistory(10, 0, 5000),
      makeHistory(11, 0, 5500),
    ]

    const transactions: Transaction[] = [
      makeTx(10, 30, 'BUY', 500), // Should apply to 10:00 fetch (5000)
      makeTx(11, 30, 'SELL', 300), // Should apply to 11:00 fetch (5500)
    ]

    const result = processHourlyData(history, transactions, [], currentDate)

    expect(result).toHaveLength(4)

    // 10:30 buy applied to 10:00 fetch (UTC timestamps have +4h offset)
    const buyPoint = result.find((p) => p.timestamp === new Date('2026-05-21T14:30:00Z').getTime())
    expect(buyPoint?.value).toBe(5500) // 5000 + 500

    // 11:30 sell applied to 11:00 fetch
    const sellPoint = result.find((p) => p.timestamp === new Date('2026-05-21T15:30:00Z').getTime())
    expect(sellPoint?.value).toBe(5200) // 5500 - 300
  })

  it('matches journal entries to transactions within 5 minute window', () => {
    const history = [makeHistory(11, 0, 10000)]

    const transactions: Transaction[] = [
      {
        id: 1,
        ticker: 'AAPL',
        type: 'BUY',
        shares: 10,
        price: 150,
        totalValue: 1500,
        timestamp: '2026-05-21T15:15:00Z', // 11:15 AM local (UTC-4)
      },
    ]

    const journalEntries: JournalEntry[] = [
      {
        id: 42,
        entryType: 'BUY',
        body: 'Bought AAPL',
        ticker: 'AAPL',
        timestamp: '2026-05-21T15:17:00Z', // 11:17 AM local, within 5 min window
        priceSnapshot: 150,
      },
      {
        id: 99,
        entryType: 'BUY',
        body: 'Different buy',
        ticker: 'TSLA',
        timestamp: '2026-05-21T15:15:00Z',
        priceSnapshot: 200,
      },
    ]

    const result = processHourlyData(history, transactions, journalEntries, currentDate)

    const txPoint = result.find((p) => p.isTransaction)
    expect(txPoint?.journalEntryId).toBe(42) // Should match the AAPL entry within 5 min
  })

  it('ignores transactions outside trading hours', () => {
    const history = [makeHistory(11, 0, 10000)]

    const transactions: Transaction[] = [
      makeTx(9, 30, 'BUY', 500), // Before 10 AM
      makeTx(16, 30, 'SELL', 300), // After 4 PM
      makeTx(11, 0, 'BUY', 200), // During hours
    ]

    const result = processHourlyData(history, transactions, [], currentDate)

    expect(result).toHaveLength(2) // Only 1 hourly + 1 valid transaction
    expect(result.filter((p) => p.isTransaction)).toHaveLength(1)
    expect(result[1].value).toBe(10200)
  })

  it('ignores transactions on different days', () => {
    const history = [makeHistory(11, 0, 10000)]

    const transactions: Transaction[] = [
      {
        id: 1,
        ticker: 'AAPL',
        type: 'BUY',
        shares: 10,
        price: 150,
        totalValue: 1500,
        timestamp: '2026-05-20T15:15:00Z', // Different day (11:15 AM local)
      },
      makeTx(11, 15, 'BUY', 500), // Same day
    ]

    const result = processHourlyData(history, transactions, [], currentDate)

    expect(result).toHaveLength(2)
    expect(result[1].value).toBe(10500) // Only same-day transaction applied
  })

  it('handles sells correctly by subtracting from previous point', () => {
    const history = [makeHistory(11, 0, 10000)]

    const transactions: Transaction[] = [
      makeTx(11, 15, 'BUY', 1000),   // 10000 + 1000 = 11000
      makeTx(11, 30, 'SELL', 500),   // 11000 - 500 = 10500
      makeTx(11, 45, 'SELL', 2000),  // 10500 - 2000 = 8500
    ]

    const result = processHourlyData(history, transactions, [], currentDate)

    expect(result).toHaveLength(4)
    expect(result[0].value).toBe(10000)
    expect(result[1].value).toBe(11000)
    expect(result[2].value).toBe(10500)
    expect(result[3].value).toBe(8500)
  })
})
