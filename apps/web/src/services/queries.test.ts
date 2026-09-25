import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isCancelledError } from '@tanstack/react-query'
import { createQueryClient } from './queryClient'
import { portfolioQueries, stockQueries } from './queries'
import { ApiError } from './api'
import { refreshAfterTrade, refreshPrices } from './queryUpdates'

let client: ReturnType<typeof createQueryClient>

beforeEach(() => { client = createQueryClient() })
afterEach(() => {
  client.clear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('shared application queries', () => {
  it('refreshes valuation for price events and the ledger for trades', async () => {
    const transactions = portfolioQueries.transactions().queryKey
    const pnl = portfolioQueries.pnl().queryKey
    client.setQueryData(transactions, [])
    client.setQueryData(pnl, {
      totalPnL: 10, totalPnLPercent: 1, unrealizedPnL: 10,
      unrealizedPnLPercent: 1, realizedPnL: 0, realizedPnLPercent: 0,
    })
    client.setQueryData(['watchlist'], [])
    await refreshPrices(client)
    expect(client.getQueryState(pnl)?.isInvalidated).toBe(true)
    expect(client.getQueryState(transactions)?.isInvalidated).toBe(false)
    await refreshAfterTrade(client)
    expect(client.getQueryState(transactions)?.isInvalidated).toBe(true)
    expect(client.getQueryState(['watchlist'])?.isInvalidated).toBe(false)
  })

  it('shares concurrent requests, reuses fresh data, and refetches after invalidation', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json([]))
    vi.stubGlobal('fetch', fetchMock)

    await Promise.all([
      client.fetchQuery(portfolioQueries.holdings()),
      client.fetchQuery(portfolioQueries.holdings()),
    ])
    await client.fetchQuery(portfolioQueries.holdings())
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await client.invalidateQueries({ queryKey: portfolioQueries.all })
    await client.fetchQuery(portfolioQueries.holdings())
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('checks freshness on demand without polling and releases unused data after 15 minutes', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockImplementation(async () => Response.json([]))
    vi.stubGlobal('fetch', fetchMock)
    const query = portfolioQueries.transactions()

    await client.fetchQuery(query)
    await vi.advanceTimersByTimeAsync(60_001)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await client.fetchQuery(query)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(15 * 60_000)
    expect(client.getQueryData(query.queryKey)).toBeUndefined()
  })

  it('keeps histories separate by ticker and start date', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
      Response.json([{ timestamp: url, currentPrice: 100 }]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const queries = [
      stockQueries.history('AAPL'),
      stockQueries.history('AAPL', '2026-09-01'),
      stockQueries.history('MSFT', '2026-09-01'),
    ]
    const results = await Promise.all(queries.map(query => client.fetchQuery(query)))
    expect(new Set(results.map(data => data[0].timestamp)).size).toBe(3)
    await client.fetchQuery(stockQueries.history('AAPL', '2026-09-01'))
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('aborts pending requests on clear and does not share data with a new client', async () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options: RequestInit) => {
      signal = options.signal ?? undefined
      return new Promise((_resolve, reject) => signal?.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError')),
      ))
    }))
    const query = portfolioQueries.holdings()
    client.setQueryData(portfolioQueries.transactions().queryKey, [])
    const request = client.fetchQuery(query).catch(error => error)
    client.clear()
    expect(signal?.aborted).toBe(true)
    expect(isCancelledError(await request)).toBe(true)
    expect(client.getQueryCache().getAll()).toHaveLength(0)

    const nextSession = createQueryClient()
    expect(nextSession.getQueryCache().getAll()).toHaveLength(0)
    nextSession.clear()
  })

  it.each([
    [new ApiError('Not authenticated', 401), 1],
    [new ApiError('Forbidden', 403), 1],
    [new ApiError('Invalid request', 400), 1],
    [new ApiError('Unavailable', 503), 2],
    [new TypeError('Failed to fetch'), 2],
  ])('bounds retries for $name: $message', async (error, attempts) => {
    const queryFn = vi.fn().mockRejectedValue(error)
    await expect(client.fetchQuery({
      queryKey: ['retry-test'], queryFn, retryDelay: 0,
    })).rejects.toBe(error)
    expect(queryFn).toHaveBeenCalledTimes(attempts)
  })
})
