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
  transactionCount?: number
  journalEntryIds?: number[]
}

const GROUP_WINDOW_MS = 2 * 60 * 1000

// Group transactions so same-type trades within two minutes of each other
// collapse into a single chart event (chained: each trade is within the
// window of the previous trade in its group).
function groupTransactions(transactions: Transaction[]): Transaction[][] {
  const groups: Transaction[][] = []
  for (const tx of transactions) {
    const txTime = new Date(tx.timestamp).getTime()
    const lastGroup = groups[groups.length - 1]
    const lastTx = lastGroup?.[lastGroup.length - 1]
    if (
      lastGroup &&
      lastTx &&
      lastTx.type === tx.type &&
      txTime - new Date(lastTx.timestamp).getTime() <= GROUP_WINDOW_MS
    ) {
      lastGroup.push(tx)
    } else {
      groups.push([tx])
    }
  }
  return groups
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
  const dayTransactions = transactions
    .filter((tx) => {
      return isSameMarketDay(tx.timestamp, currentDate) && isTradingHours(tx.timestamp)
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  // Insert synthetic transaction points (one per group)
  const merged: ChartDataPoint[] = [...dayHistory]

  for (const group of groupTransactions(dayTransactions)) {
    const groupStart = new Date(group[0].timestamp).getTime()
    const lastTx = group[group.length - 1]
    const txTime = new Date(lastTx.timestamp).getTime()
    const txType = lastTx.type as 'BUY' | 'SELL'

    // Find closest previous point (hourly OR already-inserted transaction)
    const prevPoint = merged
      .filter((p) => p.timestamp <= groupStart)
      .sort((a, b) => b.timestamp - a.timestamp)[0]

    if (!prevPoint) continue

    const netValue = group.reduce(
      (sum, tx) => sum + (tx.type === 'BUY' ? tx.totalValue : -tx.totalValue),
      0
    )
    const syntheticValue = prevPoint.value + netValue

    // Match every trade in the group to its journal entry
    const journalEntryIds: number[] = []
    for (const tx of group) {
      const txMillis = new Date(tx.timestamp).getTime()
      const matchedEntry = journalEntries
        .filter(
          (e) =>
            e.entryType === tx.type &&
            e.ticker === tx.ticker &&
            Math.abs(new Date(e.timestamp).getTime() - txMillis) <= 5 * 60 * 1000
        )
        .sort(
          (a, b) =>
            Math.abs(new Date(a.timestamp).getTime() - txMillis) -
            Math.abs(new Date(b.timestamp).getTime() - txMillis)
        )[0]
      if (matchedEntry && !journalEntryIds.includes(matchedEntry.id)) {
        journalEntryIds.push(matchedEntry.id)
      }
    }

    merged.push({
      timestamp: txTime,
      time: new Date(lastTx.timestamp).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      value: syntheticValue,
      fullTimestamp: lastTx.timestamp,
      isTransaction: true,
      transactionType: txType,
      transactionCount: group.length,
      journalEntryIds,
    })
  }

  // Sort by timestamp
  merged.sort((a, b) => a.timestamp - b.timestamp)

  return merged
}
