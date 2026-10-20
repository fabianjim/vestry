import { beforeEach, expect, it, vi } from 'vitest'
import { ApiError, authApi } from '../services/api'
import { signIn, signInErrorMessage } from './signIn'

vi.mock('../services/api', async importOriginal => ({
  ApiError: (await importOriginal<typeof import('../services/api')>()).ApiError,
  authApi: { register: vi.fn(), login: vi.fn() },
}))

beforeEach(() => vi.resetAllMocks())

it('signs a new account in after registering, and never signs in when registration fails', async () => {
  await signIn('register', 'casey', 'secret')
  expect(authApi.register).toHaveBeenCalledWith('casey', 'secret')
  expect(authApi.login).toHaveBeenCalledWith('casey', 'secret')

  vi.mocked(authApi.login).mockClear()
  vi.mocked(authApi.register).mockRejectedValueOnce(new ApiError('This user already exists', 400))
  await expect(signIn('register', 'casey', 'secret')).rejects.toThrow('This user already exists')
  expect(authApi.login).not.toHaveBeenCalled()
})

it('shows client errors from the server but hides server and network failures', () => {
  expect(signInErrorMessage(new ApiError('Invalid username or password', 400))).toBe('Invalid username or password')
  const unreachable = 'Vestry could not be reached. Check your connection and try again.'
  expect(signInErrorMessage(new ApiError('<html>Bad gateway</html>', 502))).toBe(unreachable)
  expect(signInErrorMessage(new TypeError('Failed to fetch'))).toBe(unreachable)
})
