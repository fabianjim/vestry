import type { JournalFilters } from '../types/journal'
import { queryOptions } from '@tanstack/react-query'
import { journalApi, portfolioApi, stockApi, watchlistApi } from './api'

// Cache raw responses so every screen can reuse the same request and derive its own view.
export const portfolioQueries = {
  all: ['portfolio'] as const,
  holdings: () => queryOptions({
    queryKey: [...portfolioQueries.all, 'holdings'],
    queryFn: ({ signal }) => portfolioApi.getHoldings(signal),
  }),
  history: () => queryOptions({
    queryKey: [...portfolioQueries.all, 'history'],
    queryFn: ({ signal }) => portfolioApi.getPortfolioHistory(signal),
  }),
  transactions: () => queryOptions({
    queryKey: [...portfolioQueries.all, 'transactions'],
    queryFn: ({ signal }) => portfolioApi.getTransactions(signal),
  }),
  pnl: () => queryOptions({
    queryKey: [...portfolioQueries.all, 'pnl'],
    queryFn: ({ signal }) => portfolioApi.getPnLSummary(signal),
  }),
}

export const stockQueries = {
  all: ['stock'] as const,
  snapshot: (ticker: string) => queryOptions({
    queryKey: [...stockQueries.all, ticker, 'snapshot'],
    queryFn: ({ signal }) => stockApi.getStockData(ticker, signal),
  }),
  history: (ticker: string, from?: string) => queryOptions({
    queryKey: [...stockQueries.all, ticker, 'history', from ?? null],
    queryFn: ({ signal }) => stockApi.getHistoricalData(ticker, from, signal),
  }),
}

export const watchlistQueries = {
  all: ['watchlist'] as const,
  list: () => queryOptions({
    queryKey: watchlistQueries.all,
    queryFn: ({ signal }) => watchlistApi.getWatchlist(signal),
  }),
}

// Filter order has no meaning to the API; canonicalize it to share equivalent searches.
function journalFilters(filters: JournalFilters = {}): JournalFilters {
  return {
    dates: filters.dates?.length ? [...new Set(filters.dates)].sort() : undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    query: filters.query || undefined,
    types: filters.types?.length ? [...new Set(filters.types)].sort() : undefined,
    tagIds: filters.tagIds?.length ? [...new Set(filters.tagIds)].sort((a, b) => a - b) : undefined,
  }
}

export const journalQueries = {
  all: ['journal'] as const,
  entries: (filters?: JournalFilters) => {
    const normalized = journalFilters(filters)
    const filtered = Object.values(normalized).some(value => value !== undefined)
    return queryOptions({
      queryKey: [...journalQueries.all, 'entries', normalized],
      queryFn: ({ signal }) => filtered
        ? journalApi.getFilteredEntries(normalized, signal)
        : journalApi.getEntries(signal),
    })
  },
  entry: (id: number) => queryOptions({
    queryKey: [...journalQueries.all, 'entry', id],
    queryFn: ({ signal }) => journalApi.getEntry(id, signal),
  }),
  ticker: (ticker: string) => queryOptions({
    queryKey: [...journalQueries.all, 'ticker', ticker],
    queryFn: ({ signal }) => journalApi.getEntriesForTicker(ticker, signal),
  }),
  calendar: (year: number, month: number, filters?: JournalFilters) => {
    // Calendar counts cover the whole month, independent of the selected date range.
    const normalized = journalFilters({ types: filters?.types, tagIds: filters?.tagIds, query: filters?.query })
    return queryOptions({
      queryKey: [...journalQueries.all, 'calendar', year, month, normalized],
      queryFn: ({ signal }) => journalApi.getCalendarEntries(year, month, normalized, signal),
    })
  },
  tags: (query = '') => queryOptions({
    queryKey: [...journalQueries.all, 'tags', query],
    queryFn: ({ signal }) => journalApi.getPopularTags(query, signal),
  }),
}
