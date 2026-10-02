import { beforeEach, expect, it, vi } from 'vitest'
import type { DigestState } from '../types/digest'
import { useDigest } from './useDigest'

const harness = vi.hoisted(() => ({
  available: true,
  readError: false,
  state: { status: 'IDLE', day: '2026-10-01', digest: null } as DigestState,
  attempted: { current: null as string | null },
  mutate: vi.fn(),
  options: {} as { enabled: boolean; refetchInterval: (query: { state: { data: DigestState; error?: Error } }) => number | false },
}))
vi.mock('react', () => ({
  useRef: () => harness.attempted,
  useEffect: (effect: () => void) => effect(),
}))
vi.mock('@tanstack/react-query', () => ({
  queryOptions: (options: unknown) => options,
  useQueryClient: () => ({ setQueryData: vi.fn() }),
  useQuery: (options: { queryKey: string[] }) => {
    if (options.queryKey[0] === 'digest-availability') return { data: { available: harness.available } }
    harness.options = options as unknown as typeof harness.options
    return { data: harness.state, isError: harness.readError }
  },
  useMutation: () => ({ mutate: harness.mutate }),
}))

beforeEach(() => {
  harness.available = true
  harness.readError = false
  harness.state = { status: 'IDLE', day: '2026-10-01', digest: null }
  harness.attempted.current = null
  harness.mutate.mockClear()
})

it('private accounts never auto-generate, even with no digest', () => {
  useDigest(false, true)
  expect(harness.options.enabled).toBe(true)
  expect(harness.mutate).not.toHaveBeenCalled()
})

it('visible demo generates once per date across repeated effects, with no failed-job replay', () => {
  useDigest(true, true)
  useDigest(true, true)
  expect(harness.mutate).toHaveBeenCalledTimes(1)
  harness.state = { ...harness.state, status: 'FAILED' }
  useDigest(true, true)
  expect(harness.mutate).toHaveBeenCalledTimes(1)
  harness.state = { ...harness.state, status: 'IDLE', day: '2026-10-02' }
  useDigest(true, true)
  expect(harness.mutate).toHaveBeenCalledTimes(2)
})

it('hidden or unconfigured dashboards disable digest reads, generation, and polling', () => {
  harness.state.status = 'GENERATING'
  useDigest(true, false)
  expect(harness.options.enabled).toBe(false)
  expect(harness.options.refetchInterval({ state: { data: harness.state } })).toBe(false)
  harness.state.status = 'IDLE'
  harness.available = false
  useDigest(true, true)
  expect(harness.options.enabled).toBe(false)
  expect(harness.mutate).not.toHaveBeenCalled()
})

it('polls only active generation and stops for terminal states', () => {
  useDigest(false, true)
  expect(harness.options.refetchInterval({ state: { data: { ...harness.state, status: 'GENERATING' } } })).toBe(2000)
  expect(harness.options.refetchInterval({ state: { data: { ...harness.state, status: 'GENERATING' }, error: new Error('offline') } })).toBe(false)
  expect(harness.options.refetchInterval({ state: { data: { ...harness.state, status: 'FAILED' } } })).toBe(false)
  expect(harness.options.refetchInterval({ state: { data: { ...harness.state, status: 'READY' } } })).toBe(false)
})

it('does not auto-generate from stale idle data after a failed status request', () => {
  harness.readError = true
  useDigest(true, true)
  expect(harness.mutate).not.toHaveBeenCalled()
})
