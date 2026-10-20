import { useState, useEffect, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../services/api'
import { useDemoLogin } from '../hooks/useDemoLogin'
import { preloadApplication } from '../utils/loadApplication'
import { redirectAfterLogin } from '../utils/redirectAfterLogin'
import { signIn, signInErrorMessage, type AuthMode } from '../utils/signIn'

const inputClass = 'w-full px-3 py-2 bg-surface border border-border-control rounded-md text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary'

export default function Login() {
  const navigate = useNavigate()
  const demo = useDemoLogin()

  const [mode, setMode] = useState<AuthMode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isRegister = mode === 'register'

  useEffect(() => {
    document.title = isRegister ? 'Create account | Vestry' : 'Sign in | Vestry'
  }, [isRegister])

  useEffect(() => {
    let active = true
    // Demo visitors stay here so they can sign in to their own account.
    authApi.me()
      .then(user => { if (active && !user.isDemo) void redirectAfterLogin(navigate) })
      .catch(() => {})
    return () => { active = false }
  }, [navigate])

  const switchMode = () => {
    setMode(isRegister ? 'login' : 'register')
    setConfirmPassword('')
    setError('')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username || !password) {
      setError('Enter a username and password.')
      return
    }
    if (isRegister && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    preloadApplication()
    setLoading(true)
    try {
      await signIn(mode, username, password)
      await redirectAfterLogin(navigate)
    } catch (failure) {
      setError(signInErrorMessage(failure))
    } finally {
      setLoading(false)
    }
  }

  const busy = loading || demo.loading

  return (
    <div className="min-h-dvh flex flex-col items-center px-5 py-10 sm:justify-center">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 inline-flex items-center gap-2 text-lg font-130 text-foreground">
          <img src="/logo.svg" alt="" width={36} height={36} className="shrink-0" />
          Vestry
        </Link>

        <h1 className="mb-6 text-2xl font-90 tracking-tight">{isRegister ? 'Create your account' : 'Welcome back'}</h1>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="username" className="mb-1 block text-sm text-secondary">Username</label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-secondary">Password</label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 px-3 text-sm text-muted hover:text-foreground transition-colors cursor-pointer"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {isRegister && (
            <div>
              <label htmlFor="confirm-password" className="mb-1 block text-sm text-secondary">Confirm password</label>
              <input
                id="confirm-password"
                name="confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
              />
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-md border border-error-border bg-error-soft px-3 py-2 text-sm text-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full px-3 py-2 bg-primary text-primary-foreground rounded-md font-130 cursor-pointer disabled:cursor-not-allowed disabled:bg-disabled-background disabled:text-disabled-foreground hover:bg-primary-hover active:bg-primary-active transition-colors"
          >
            {loading ? (isRegister ? 'Creating account…' : 'Signing in…') : (isRegister ? 'Create account' : 'Sign in')}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-secondary">
          {isRegister ? 'Already have an account?' : 'New to Vestry?'}{' '}
          <button type="button" onClick={switchMode} className="text-link hover:underline cursor-pointer">
            {isRegister ? 'Sign in' : 'Create an account'}
          </button>
        </p>

        <div className="my-6 flex items-center gap-3 text-xs text-muted" aria-hidden="true">
          <span className="h-px flex-1 bg-border-subtle" />
          or
          <span className="h-px flex-1 bg-border-subtle" />
        </div>

        <button
          type="button"
          onClick={() => void demo.start()}
          disabled={busy}
          className="w-full px-3 py-2 bg-surface border border-border rounded-md cursor-pointer hover:bg-surface-hover active:bg-surface-active transition-colors disabled:cursor-not-allowed disabled:text-disabled-foreground"
        >
          {demo.loading ? 'Opening demo…' : 'Explore the demo'}
        </button>
        {demo.error && <p role="status" className="mt-3 text-sm text-secondary">{demo.error}</p>}
      </div>
    </div>
  )
}
