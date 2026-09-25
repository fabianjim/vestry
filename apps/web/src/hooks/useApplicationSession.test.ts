import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../services/queryClient'
import { portfolioApi } from '../services/api'
import { useApplicationSession as mountSession } from './useApplicationSession'

const harness = vi.hoisted(() => ({
  cleanup: [] as (() => void)[], setters: [] as ReturnType<typeof vi.fn>[],
}))
vi.mock('react', () => ({
  useState: (value: unknown) => {
    const setter = vi.fn()
    harness.setters.push(setter)
    return [value, setter]
  },
  useEffect: (effect: () => () => void) => { harness.cleanup.push(effect()) },
}))

const user = { userId: 1, username: 'investor', isDemo: false }
let client: ReturnType<typeof createQueryClient>
let documentEvents: EventTarget

beforeEach(() => {
  harness.setters = []
  client = createQueryClient()
  documentEvents = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  vi.stubGlobal('document', documentEvents)
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json(user)))
})
afterEach(() => {
  harness.cleanup.splice(0).forEach(cleanup => cleanup())
  client.clear()
  vi.unstubAllGlobals()
})

async function startSession() {
  mountSession(client)
  await vi.waitFor(() => expect(harness.setters[0]).toHaveBeenCalledWith(user))
  client.setQueryData(['portfolio', 'transactions'], [{ id: 1 }])
}

describe('application session lifecycle', () => {
  it('clears private data and redirects on confirmed expiry from an API call', async () => {
    await startSession()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }))
    await expect(portfolioApi.getTransactions()).rejects.toMatchObject({ status: 401 })
    expect(client.getQueryCache().getAll()).toHaveLength(0)
    expect(harness.setters[2]).toHaveBeenCalledWith(true)
  })

  it('verifies a forbidden response without logging out an authenticated user', async () => {
    await startSession()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 403 }))
    await expect(portfolioApi.getTransactions()).rejects.toMatchObject({ status: 403 })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(client.getQueryData(['portfolio', 'transactions'])).toEqual([{ id: 1 }])
    expect(harness.setters[2]).not.toHaveBeenCalled()
  })

  it('keeps cached data during a temporary connection failure', async () => {
    await startSession()
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    documentEvents.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(harness.setters[1]).toHaveBeenLastCalledWith(expect.stringContaining('connection')))
    expect(client.getQueryData(['portfolio', 'transactions'])).toEqual([{ id: 1 }])
    expect(harness.setters[2]).not.toHaveBeenCalled()
  })

  it('clears cached data when session validation detects another account', async () => {
    await startSession()
    const nextUser = { ...user, userId: 2, username: 'another' }
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(nextUser))
    documentEvents.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(harness.setters[0]).toHaveBeenLastCalledWith(nextUser))
    expect(client.getQueryCache().getAll()).toHaveLength(0)
  })

  it('ignores a late failure from a previous session after cleanup', async () => {
    await startSession()
    let respond!: (value: Response) => void
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { respond = resolve }))
    const pending = portfolioApi.getTransactions()
    harness.cleanup.splice(0).forEach(cleanup => cleanup())
    mountSession(client)
    await vi.waitFor(() => expect(harness.setters[3]).toHaveBeenCalledWith(user))
    client.setQueryData(['portfolio', 'transactions'], [{ id: 2 }])
    respond(new Response(null, { status: 401 }))
    await expect(pending).rejects.toMatchObject({ status: 401 })
    expect(client.getQueryData(['portfolio', 'transactions'])).toEqual([{ id: 2 }])
    expect(harness.setters[5]).not.toHaveBeenCalled()
  })
})
