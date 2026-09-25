import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'

// Create a fresh client per authenticated session; never share private caches across logins.
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 15 * 60_000,
        retry: (failureCount, error) => failureCount < 1 &&
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
          error.name !== 'AbortError',
      },
      mutations: { retry: false },
    },
  })
}
