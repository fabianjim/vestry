import { queryOptions } from '@tanstack/react-query'
import { portfolioApi, stockApi, watchlistApi } from './api'

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
