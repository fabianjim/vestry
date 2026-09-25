import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../services/queryClient'
import { portfolioQueries } from '../services/queries'
import { usePriceUpdates } from './usePriceUpdates'

const harness = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined, update: vi.fn() }))
vi.mock('react', () => ({
  useState: () => [0, harness.update],
  useEffect: (effect: () => (() => void) | undefined) => { harness.cleanup = effect() },
}))

class TestEvents extends EventTarget {
  static latest: TestEvents
  close = vi.fn()
  readonly options: EventSourceInit
  constructor(_url: string, options: EventSourceInit) {
    super()
    this.options = options
    TestEvents.latest = this
  }
}

afterEach(() => {
  harness.cleanup?.()
  harness.update.mockClear()
  vi.unstubAllGlobals()
})

describe('shared price updates', () => {
  it('refreshes on completion and reconnect, checks failures once, and closes on cleanup', () => {
    vi.stubGlobal('EventSource', TestEvents)
    vi.stubGlobal('document', { visibilityState: 'visible' })
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json({ userId: 1 })))
    const client = createQueryClient()
    const history = portfolioQueries.history().queryKey
    client.setQueryData(history, [])
    usePriceUpdates(client, '1:false')
    const events = TestEvents.latest
    expect(events.options.withCredentials).toBe(true)
    events.dispatchEvent(new Event('open'))
    expect(client.getQueryState(history)?.isInvalidated).toBe(false)
    events.dispatchEvent(new Event('priceFetchCompleted'))
    expect(client.getQueryState(history)?.isInvalidated).toBe(true)
    client.setQueryData(history, [])
    events.dispatchEvent(new Event('error'))
    events.dispatchEvent(new Event('error'))
    expect(fetch).toHaveBeenCalledTimes(1)
    events.dispatchEvent(new Event('open'))
    expect(client.getQueryState(history)?.isInvalidated).toBe(true)
    expect(harness.update).toHaveBeenCalledTimes(2)
    harness.cleanup?.()
    expect(events.close).toHaveBeenCalled()
    events.dispatchEvent(new Event('priceFetchCompleted'))
    expect(harness.update).toHaveBeenCalledTimes(2)
    client.clear()
  })
})
