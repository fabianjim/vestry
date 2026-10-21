import { ApiError, authApi } from '../services/api'

export type AuthMode = 'login' | 'register'

/** Registering also signs in, so a new account goes straight to onboarding. */
export async function signIn(mode: AuthMode, username: string, password: string, honeypot = '') {
  if (mode === 'register') await authApi.register(username, password, honeypot)
  await authApi.login(username, password)
}

export function signInErrorMessage(failure: unknown) {
  if (failure instanceof ApiError && failure.status < 500) return failure.message
  return 'Vestry could not be reached. Check your connection and try again.'
}
