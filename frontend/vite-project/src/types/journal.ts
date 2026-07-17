export type JournalEntryType = 'BUY' | 'SELL' | 'INSIGHT' | 'MARKET_EVENT'

export type Tag = {
  id: number
  name: string
  color: string
}

export type JournalEntry = {
  id: number
  entryType: JournalEntryType
  body: string
  ticker: string | null
  timestamp: string
  priceSnapshot: number | null
  tags: Tag[]
}

export type CreateJournalEntryRequest = {
  entryType: JournalEntryType
  body: string
  ticker?: string | null
  timestamp?: string
  priceSnapshot?: number
  tags?: string[]
}

export type UpdateJournalEntryRequest = {
  body: string
  tags?: string[]
}

export type CalendarDay = {
  date: string
  count: number
}

export type JournalFilters = {
  from?: string
  to?: string
  types?: JournalEntryType[]
  ticker?: string
  tagIds?: number[]
  query?: string
}
