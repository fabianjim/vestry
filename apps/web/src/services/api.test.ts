import { afterEach, describe, expect, it, vi } from 'vitest'
import { authApi, portfolioApi, stockApi } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('public session status', () => {
  it.each([false, true])('returns authenticated=%s through the same-origin session check', async authenticated => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ authenticated }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    ))
    vi.stubGlobal('fetch', fetchMock)

    await expect(authApi.sessionStatus()).resolves.toEqual({ authenticated })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session-status', expect.objectContaining({
      credentials: 'include',
      method: 'GET',
    }))
  })
})

describe('portfolio API errors', () => {
  it('loads and saves the compact holdings layout with session credentials', async () => {
    const layout = { v: 1 as const, cards: [['realized', 2] as ['realized', 2]] }
    const fetchMock = vi.fn().mockImplementation(async () => Response.json(layout))
    vi.stubGlobal('fetch', fetchMock)
    await expect(portfolioApi.getHoldingsLayout()).resolves.toEqual(layout)
    await expect(portfolioApi.saveHoldingsLayout(layout)).resolves.toEqual(layout)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/portfolio/holdings-layout', expect.objectContaining({
      method: 'PUT', credentials: 'include', body: JSON.stringify(layout),
    }))
  })

  it('retains the HTTP status for session-expiry handling', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: 'Not authenticated' }), { status: 401 },
    )))
    await expect(authApi.me()).rejects.toMatchObject({ status: 401, message: 'Not authenticated' })
  })

  it('passes cancellation through without changing a network error into an HTTP error', async () => {
    const controller = new AbortController()
    const aborted = new DOMException('Request aborted', 'AbortError')
    const fetchMock = vi.fn().mockImplementation((_url, options: RequestInit) =>
      new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(aborted))),
    )
    vi.stubGlobal('fetch', fetchMock)
    const request = stockApi.getHistoricalData('AAPL', '2026-09-01T00:00:00Z', controller.signal)
    controller.abort()
    await expect(request).rejects.toBe(aborted)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/stock/history/AAPL?from=2026-09-01T00%3A00%3A00Z',
      expect.objectContaining({ credentials: 'include', signal: controller.signal }),
    )
  })

  it.each([
    ['holding limit', JSON.stringify({ error: 'A portfolio can contain at most 8 holdings.' }), 'A portfolio can contain at most 8 holdings.'],
    ['demo limit', JSON.stringify({ error: 'Demo trade limit reached', demoTradeLimitReached: 'true' }), 'Demo trade limit reached'],
    ['plain text', 'Service unavailable', 'Service unavailable'],
    ['unexpected JSON', JSON.stringify({ error: 123 }), '{"error":123}'],
    ['empty response', '', 'HTTP 400: Bad Request'],
  ])('preserves a useful message for %s', async (_name, body, message) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
      new Response(body, { status: 400, statusText: 'Bad Request' })
    ))

    await expect(portfolioApi.addHolding('NEW', 1)).rejects.toThrow(message)
    await expect(portfolioApi.createPortfolio([{ ticker: 'NEW', shares: 1 }])).rejects.toThrow(message)
  })

  it('sends portfolio creation through the same-origin authenticated API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const holdings = [{ ticker: 'AAPL', shares: 1 }]

    await portfolioApi.createPortfolio(holdings)

    expect(fetchMock).toHaveBeenCalledWith('/api/portfolio/create', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ holdings }),
    }))
  })
})
