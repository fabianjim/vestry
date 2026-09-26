import type { QueryClient } from '@tanstack/react-query'
import { journalQueries, portfolioQueries, stockQueries } from './queries'

export function refreshPrices(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: stockQueries.all }),
    client.invalidateQueries({ queryKey: portfolioQueries.holdings().queryKey }),
    client.invalidateQueries({ queryKey: portfolioQueries.history().queryKey }),
    client.invalidateQueries({ queryKey: portfolioQueries.pnl().queryKey }),
  ])
}

export function refreshAfterTrade(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: portfolioQueries.all }),
    refreshJournal(client),
    client.invalidateQueries({ queryKey: stockQueries.all }),
  ])
}

// Lists, reflections, calendar counts, and tag suggestions all depend on journal mutations.
export function refreshJournal(client: QueryClient) {
  return client.invalidateQueries({ queryKey: journalQueries.all })
}
