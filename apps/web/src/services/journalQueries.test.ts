import { afterEach, describe, expect, it, vi } from 'vitest'
import { isCancelledError, QueryObserver } from '@tanstack/react-query'
import { createQueryClient } from './queryClient'
import { journalQueries, portfolioQueries } from './queries'
import { refreshAfterTrade, refreshJournal, refreshPrices } from './queryUpdates'

const client = createQueryClient()
afterEach(() => { client.clear(); vi.unstubAllGlobals() })

describe('journal cache', () => {
  it('shares equivalent filters and unfiltered lists without mixing different searches', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json([]))
    vi.stubGlobal('fetch', fetchMock)
    await client.fetchQuery(journalQueries.entries())
    await client.fetchQuery(journalQueries.entries({ types: [], tagIds: [], query: '' }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await client.fetchQuery(journalQueries.entries({ types: ['BUY', 'SELL'], tagIds: [3, 1] }))
    await client.fetchQuery(journalQueries.entries({ types: ['SELL', 'BUY'], tagIds: [1, 3, 1] }))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await client.fetchQuery(journalQueries.entries({ query: 'AAPL' }))
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('canonicalizes separate dates, sends NY bounds, and leaves calendar counts independent', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json([]))
    vi.stubGlobal('fetch', fetchMock)
    await client.fetchQuery(journalQueries.entries({ dates: ['2026-03-10', '2026-03-08', '2026-03-08'] }))
    await client.fetchQuery(journalQueries.entries({ dates: ['2026-03-08', '2026-03-10'] }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(new URL(fetchMock.mock.calls[0][0], 'http://localhost').searchParams.getAll('dates')).toEqual(['2026-03-08', '2026-03-10'])
    await client.fetchQuery(journalQueries.entries({ from: '2026-03-08', to: '2026-03-08' }))
    const params = new URL(fetchMock.mock.calls[1][0], 'http://localhost').searchParams
    expect(params.get('from')).toBe('2026-03-08T05:00:00.000Z')
    expect(params.get('to')).toBe('2026-03-09T03:59:59.999Z')
    await client.fetchQuery(journalQueries.calendar(2026, 3, { dates: ['2026-03-08'] }))
    await client.fetchQuery(journalQueries.calendar(2026, 3, { dates: ['2026-03-10'] }))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[2][0]).not.toContain('dates=')
  })

  it('shares calendar counts across date selections but separates months and tag filters', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json([]))
    vi.stubGlobal('fetch', fetchMock)
    await client.fetchQuery(journalQueries.calendar(2026, 9, { from: '2026-09-01', tagIds: [1] }))
    await client.fetchQuery(journalQueries.calendar(2026, 9, { from: '2026-09-02', tagIds: [1] }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).not.toContain('from=')
    await client.fetchQuery(journalQueries.calendar(2026, 10, { tagIds: [1] }))
    await client.fetchQuery(journalQueries.calendar(2026, 9, { tagIds: [2] }))
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('invalidates every journal projection after edits and trades, but not price updates', async () => {
    const keys = [
      journalQueries.entries().queryKey, journalQueries.entry(42).queryKey,
      journalQueries.ticker('AAPL').queryKey, journalQueries.calendar(2026, 9).queryKey,
      journalQueries.tags('result').queryKey,
    ]
    const seed = () => keys.forEach(key => client.setQueryData(key, []))
    seed()
    client.setQueryData(portfolioQueries.transactions().queryKey, [])
    await refreshPrices(client)
    expect(keys.every(key => !client.getQueryState(key)?.isInvalidated)).toBe(true)
    await refreshJournal(client)
    expect(keys.every(key => client.getQueryState(key)?.isInvalidated)).toBe(true)
    expect(client.getQueryState(portfolioQueries.transactions().queryKey)?.isInvalidated).toBe(false)
    seed()
    await refreshAfterTrade(client)
    expect(keys.every(key => client.getQueryState(key)?.isInvalidated)).toBe(true)
  })

  it('refetches a shared list once for multiple active views after a journal mutation', async () => {
    let body = 'Original thesis'
    const fetchMock = vi.fn().mockImplementation(async () => Response.json([{ id: 1, body }]))
    vi.stubGlobal('fetch', fetchMock)
    await client.fetchQuery(journalQueries.entries())
    const dashboard = new QueryObserver(client, journalQueries.entries())
    const journal = new QueryObserver(client, journalQueries.entries())
    const unsubscribeDashboard = dashboard.subscribe(() => {})
    const unsubscribeJournal = journal.subscribe(() => {})
    try {
      body = 'Revised thesis'
      await refreshJournal(client)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(dashboard.getCurrentResult().data?.[0].body).toBe(body)
      expect(journal.getCurrentResult().data?.[0].body).toBe(body)
    } finally {
      unsubscribeDashboard()
      unsubscribeJournal()
    }
  })

  it('aborts in-flight journal requests when the session cache is cleared', async () => {
    const signals: AbortSignal[] = []
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options: RequestInit) => {
      signals.push(options.signal!)
      return new Promise((_resolve, reject) => options.signal!.addEventListener('abort', () =>
        reject(new DOMException('Aborted', 'AbortError'))))
    }))
    const requests = [
      client.fetchQuery(journalQueries.entries()),
      client.fetchQuery(journalQueries.ticker('AAPL')),
      client.fetchQuery(journalQueries.calendar(2026, 9)),
      client.fetchQuery(journalQueries.tags()),
    ].map(request => request.catch(error => error))
    client.clear()
    expect(signals).toHaveLength(4)
    expect(signals.every(signal => signal.aborted)).toBe(true)
    expect((await Promise.all(requests)).every(isCancelledError)).toBe(true)
  })
})
