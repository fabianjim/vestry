import { afterEach, describe, expect, it, vi } from 'vitest'
import { portfolioApi } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('portfolio API errors', () => {
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
