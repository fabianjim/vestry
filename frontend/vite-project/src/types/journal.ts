export type JournalEntryType = 'BUY' | 'SELL' | 'INSIGHT' | 'MARKET_EVENT'

export type JournalEntry = {
  id: number
  entryType: JournalEntryType
  body: string
  ticker: string | null
  timestamp: string
  priceSnapshot: number | null
}

export type CreateJournalEntryRequest = {
  entryType: JournalEntryType
  body: string
  ticker?: string | null
}
