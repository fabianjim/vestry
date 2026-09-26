import { useMemo } from 'react'
import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { portfolioQueries, stockQueries } from '../services/queries'
import type { Holding } from '../types/portfolio'
import type { StockData } from '../types/stock'

const EMPTY_HOLDINGS: Holding[] = []

// Structural sharing keeps derived graph data stable during background refreshes.
const combineQuotes = (queries: UseQueryResult<StockData>[]) => ({
  data: queries.map(query => query.data),
  isPending: queries.some(query => query.isPending),
  error: queries.find(query => query.error)?.error,
})

export function useHoldings() {
  const holdingsQuery = useQuery(portfolioQueries.holdings())
  const holdings = holdingsQuery.data ?? EMPTY_HOLDINGS
  const quotes = useQueries({
    queries: holdings.map(holding => stockQueries.snapshot(holding.ticker)),
    combine: combineQuotes,
  })
  const data = useMemo(() => holdings.map((holding, index) => ({
    ...holding,
    stockData: quotes.data[index],
  })), [holdings, quotes.data])

  return {
    data,
    isPending: holdingsQuery.isPending || quotes.isPending,
    error: holdingsQuery.error ?? quotes.error,
  }
}
