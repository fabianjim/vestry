import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '../services/queryClient'
import { portfolioQueries, stockQueries } from '../services/queries'
import { useHoldings } from './useHoldings'
import { useHoldingGraphData } from './useHoldingGraphData'
import type { StockData } from '../types/stock'

const client = createQueryClient()
const quote = (ticker: string, price: number): StockData => ({
  stock: { ticker, currentPrice: price, timestamp: '2026-09-24T14:00:00Z', open: price, high: price, low: price, prevClose: price },
  stale: false, staleWarning: null, lastSuccessfulFetch: null, eod: false,
})

function readHook<T>(hook: () => T): T {
  let result!: T
  function Consumer() {
    result = hook()
    return null
  }
  renderToString(<QueryClientProvider client={client}><Consumer /></QueryClientProvider>)
  return result
}

afterEach(() => { client.clear(); vi.unstubAllGlobals() })

describe('shared holdings views', () => {
  it('renders dashboard and graph from cached responses without enriching the raw holdings cache', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const holdings = [{ ticker: 'AAPL', shares: 2 }, { ticker: 'MSFT', shares: 3 }]
    client.setQueryData(portfolioQueries.holdings().queryKey, holdings)
    client.setQueryData(stockQueries.snapshot('AAPL').queryKey, quote('AAPL', 100))
    client.setQueryData(stockQueries.snapshot('MSFT').queryKey, quote('MSFT', 200))
    client.setQueryData(['watchlist'], [])

    const dashboard = readHook(useHoldings)
    const analysis = readHook(useHoldingGraphData)
    expect(dashboard.isPending).toBe(false)
    expect(dashboard.data.map(h => h.stockData?.stock?.ticker)).toEqual(['AAPL', 'MSFT'])
    expect(analysis.totalValue).toBe(800)
    expect(new Set(analysis.holdingsValueData.map(holding => holding.color)).size).toBe(2)
    expect(new Set(analysis.nodes.map(node => node.color)).size).toBe(1)
    expect(client.getQueryData(portfolioQueries.holdings().queryKey)).toEqual(holdings)
    expect(fetchMock).not.toHaveBeenCalled()

    // A full sell changes list indexes; quotes must remain attached to their tickers.
    client.setQueryData(portfolioQueries.holdings().queryKey, [holdings[1]])
    expect(readHook(useHoldings).data[0].stockData?.stock?.ticker).toBe('MSFT')
    expect(readHook(useHoldingGraphData).totalValue).toBe(600)
  })

  it('retains holdings while a missing quote loads and does not request watchlist prices', () => {
    client.setQueryData(portfolioQueries.holdings().queryKey, [{ ticker: 'AAPL', shares: 2 }])
    client.setQueryData(['watchlist'], [{ id: 1, ticker: 'MSFT', metadata: null }])
    const dashboard = readHook(useHoldings)
    expect(dashboard.isPending).toBe(true)
    expect(dashboard.data).toEqual([{ ticker: 'AAPL', shares: 2, stockData: undefined }])
    const analysis = readHook(useHoldingGraphData)
    expect(analysis.nodes.map(node => node.id)).toEqual(['holding-AAPL', 'watchlist-MSFT'])
    expect(client.getQueryState(stockQueries.snapshot('MSFT').queryKey)).toBeUndefined()
  })
})
