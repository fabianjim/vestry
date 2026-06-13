import type { Transaction } from '../types/transaction'
import type { JournalEntry } from '../types/journal'
import { isTradingHours, isSameMarketDay } from './dateUtils'

interface HistoryData {
  timestamp: string
  portfolioValue: number
}

export interface ChartDataPoint {
  timestamp: number
  time: string
  value: number
  fullTimestamp: string
  isTransaction?: boolean
  transactionType?: 'BUY' | 'SELL'
  journalEntryId?: number
}

export function processHourlyData(
  data: HistoryData[],
  transactions: Transaction[],
  journalEntries: JournalEntry[],
  currentDate: Date
): ChartDataPoint[] {
  // Filter portfolio history to current day AND trading hours (10am-4pm)
  const dayHistory = data
    .filter((item) => {
      return isSameMarketDay(item.timestamp, currentDate) && isTradingHours(item.timestamp)
    })
    .map((item) => ({
      timestamp: new Date(item.timestamp).getTime(),
      time: new Date(item.timestamp).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      value: item.portfolioValue,
      fullTimestamp: item.timestamp,
      isTransaction: false,
    }))

  // Filter transactions to current day AND trading hours (10am-4pm)
  // Exclude initial portfolio creation transactions — they are not graph events
  const dayTransactions = transactions
    .filter((tx) => {
      if (tx.initial) return false
      return isSameMarketDay(tx.timestamp, currentDate) && isTradingHours(tx.timestamp)
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  // Insert synthetic transaction points
  const merged: ChartDataPoint[] = [...dayHistory]

  for (const tx of dayTransactions) {
    const txTime = new Date(tx.timestamp).getTime()

    // Find closest previous point (hourly OR already-inserted transaction)
    const prevPoint = merged
      .filter((p) => p.timestamp <= txTime)
      .sort((a, b) => b.timestamp - a.timestamp)[0]

    if (!prevPoint) continue

    const syntheticValue =
      tx.type === 'BUY'
        ? prevPoint.value + tx.totalValue
        : prevPoint.value - tx.totalValue

    // Match to journal entry
    const txType = tx.type as 'BUY' | 'SELL'
    const matchedEntry = journalEntries
      .filter(
        (e) =>
          e.entryType === txType &&
          e.ticker === tx.ticker &&
          Math.abs(new Date(e.timestamp).getTime() - txTime) <= 5 * 60 * 1000
      )
      .sort(
        (a, b) =>
          Math.abs(new Date(a.timestamp).getTime() - txTime) -
          Math.abs(new Date(b.timestamp).getTime() - txTime)
      )[0]

    merged.push({
      timestamp: txTime,
      time: new Date(tx.timestamp).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      value: syntheticValue,
      fullTimestamp: tx.timestamp,
      isTransaction: true,
      transactionType: txType,
      journalEntryId: matchedEntry?.id,
    })
  }

  // Sort by timestamp
  merged.sort((a, b) => a.timestamp - b.timestamp)

  return merged
}
