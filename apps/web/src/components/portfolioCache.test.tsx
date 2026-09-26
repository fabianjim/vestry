import { ViewStateProvider } from '../contexts/ViewState'
import { afterEach, describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createQueryClient } from '../services/queryClient'
import { portfolioQueries, stockQueries } from '../services/queries'
import PortfolioChart from './PortfolioChart'
import NodeDetailPanel from './NodeDetailPanel'

const client = createQueryClient()
const render = (element: ReactNode) => renderToString(
  <QueryClientProvider client={client}><ViewStateProvider>{element}</ViewStateProvider></QueryClientProvider>,
)
const panel = (ticker: string, isWatchlist = false) => (
  <NodeDetailPanel ticker={ticker} isWatchlist={isWatchlist} metadata={null}
    trackingStartDate={null} onClose={() => {}} />
)
afterEach(() => client.clear())

describe('cached portfolio views', () => {
  it('renders a cached chart immediately and preserves it after a background failure', () => {
    client.setQueryData(portfolioQueries.history().queryKey, [
      { timestamp: new Date().toISOString(), portfolioValue: 100 },
    ])
    client.setQueryData(portfolioQueries.transactions().queryKey, [])
    expect(render(<PortfolioChart />)).toContain('Hourly')
    expect(render(<PortfolioChart />)).not.toContain('Loading chart')

    client.getQueryCache().find({ queryKey: portfolioQueries.history().queryKey })!
      .setState({ status: 'error', error: new Error('Connection interrupted') })
    const html = render(<PortfolioChart />)
    expect(html).toContain('Connection interrupted')
    expect(html).toContain('Hourly')
  })

  it('uses cached history for the selected ticker without leaking another ticker’s history', () => {
    client.setQueryData(portfolioQueries.transactions().queryKey, [])
    client.setQueryData(stockQueries.history('AAPL').queryKey, [])
    const cached = render(panel('AAPL'))
    expect(cached).toContain('No price history available.')
    expect(cached).not.toContain('Loading position')
    const uncached = render(panel('MSFT'))
    expect(uncached).not.toContain('No price history available.')
    expect(client.getQueryState(stockQueries.history('MSFT').queryKey)?.data).toBeUndefined()
  })

})
