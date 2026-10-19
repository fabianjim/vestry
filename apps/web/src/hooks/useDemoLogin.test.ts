import { expect, it, vi } from 'vitest'
import { authApi } from '../services/api'
import { preloadApplication } from '../utils/loadApplication'
import { useDemoLogin } from './useDemoLogin'

const harness = vi.hoisted(() => ({ setters: [] as ReturnType<typeof vi.fn>[], navigate: vi.fn() }))
vi.mock('react', () => ({
  useState: (value: unknown) => {
    const setter = vi.fn()
    harness.setters.push(setter)
    return [value, setter]
  },
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => harness.navigate }))
vi.mock('../services/api', () => ({ authApi: { login: vi.fn() }, portfolioApi: { portfolioExists: vi.fn().mockResolvedValue(true) } }))
vi.mock('../utils/loadApplication', () => ({ preloadApplication: vi.fn() }))

it('opens the demo on success and keeps failures inline without navigating', async () => {
  vi.mocked(authApi.login).mockResolvedValueOnce({ authenticated: true, username: 'demo', isDemo: true })
  const { start } = useDemoLogin()
  const [setLoading, setError] = harness.setters
  await start()
  expect(preloadApplication).toHaveBeenCalledOnce()
  expect(authApi.login).toHaveBeenCalledWith('demo', 'demo')
  expect(harness.navigate).toHaveBeenCalledWith('/dashboard')
  expect(setLoading.mock.calls).toEqual([[true], [false]])
  expect(setError).toHaveBeenLastCalledWith(null)

  harness.navigate.mockClear()
  setError.mockClear()
  vi.mocked(authApi.login).mockRejectedValueOnce(new Error('Server unavailable'))
  await start()
  expect(setError).toHaveBeenLastCalledWith('The demo is waiting on the server. Try again in a moment.')
  expect(setLoading).toHaveBeenLastCalledWith(false)
  expect(harness.navigate).not.toHaveBeenCalled()
})
