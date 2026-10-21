import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, authApi, portfolioApi } from '../services/api'
import LoadingScreen from '../components/LoadingScreen'
import TickerCombobox from '../components/TickerCombobox'
import { XMarkIcon } from '../components/icons'
import {
  MAX_HOLDINGS,
  createPortfolioErrorMessage,
  validateHoldingDrafts,
  type HoldingDraft,
} from '../utils/holdingDrafts'

const inputClass = 'w-full min-w-0 px-3 py-2 bg-surface border rounded-md text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary'

const isSignedOut = (failure: unknown) =>
  failure instanceof ApiError && (failure.status === 401 || failure.status === 403)

export default function Portfolio() {
  const navigate = useNavigate()
  const nextId = useRef(1)

  const [checking, setChecking] = useState(true)
  const [rows, setRows] = useState<HoldingDraft[]>([{ id: 0, ticker: '', shares: '' }])
  const [rowErrors, setRowErrors] = useState<(string | null)[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    document.title = 'Add holdings | Vestry'
  }, [])

  useEffect(() => {
    let active = true
    const check = async () => {
      try {
        await authApi.me()
        if (await portfolioApi.portfolioExists()) {
          if (active) navigate('/dashboard', { replace: true })
          return
        }
      } catch (failure) {
        if (active && isSignedOut(failure)) {
          navigate('/login', { replace: true })
          return
        }
        // Other failures surface when the form is submitted.
      }
      if (active) setChecking(false)
    }
    void check()
    return () => { active = false }
  }, [navigate])

  const updateRow = (id: number, change: Partial<HoldingDraft>) => {
    setRows(rows.map(row => (row.id === id ? { ...row, ...change } : row)))
    setRowErrors([])
  }

  const addRow = () => {
    setRows([...rows, { id: nextId.current++, ticker: '', shares: '' }])
  }

  const removeRow = (id: number) => {
    setRows(rows.filter(row => row.id !== id))
    setRowErrors([])
  }

  const handleSignOut = async () => {
    try {
      await authApi.logout()
    } catch (failure) {
      console.error('Logout error:', failure)
    }
    navigate('/')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    const { errors, holdings } = validateHoldingDrafts(rows)
    setRowErrors(errors)
    if (errors.some(Boolean)) return
    if (holdings.length === 0) {
      setError('Add at least one holding.')
      return
    }

    setLoading(true)
    try {
      await portfolioApi.createPortfolio(holdings)
      navigate('/dashboard')
    } catch (failure) {
      if (isSignedOut(failure)) {
        navigate('/login', { replace: true })
        return
      }
      setError(createPortfolioErrorMessage(failure))
    } finally {
      setLoading(false)
    }
  }

  if (checking) return <LoadingScreen message="Checking your session…" />

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border-subtle">
        <div className="max-w-xl mx-auto px-5 h-14 flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg font-130 text-foreground">
            <img src="/logo.svg" alt="" width={32} height={32} className="shrink-0" />
            Vestry
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-sm text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-5 py-10">
        <h1 className="mb-6 text-2xl font-90 tracking-tight">Add your holdings</h1>

        <form onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-[1fr_1fr_2.5rem] gap-x-2 mb-1 text-sm text-secondary" aria-hidden="true">
            <span>Ticker</span>
            <span>Shares</span>
          </div>

          <ul className="space-y-2">
            {rows.map((row, index) => {
              const rowError = rowErrors[index]
              const errorId = `holding-${row.id}-error`
              const describedBy = rowError ? errorId : undefined
              return (
                <li key={row.id}>
                  <div className="grid grid-cols-[1fr_1fr_2.5rem] gap-2">
                    <TickerCombobox
                      label={`Ticker ${index + 1}`}
                      invalid={Boolean(rowError)}
                      describedBy={describedBy}
                      value={row.ticker}
                      onChange={(ticker) => updateRow(row.id, { ticker })}
                      onSelect={(ticker) => {
                        updateRow(row.id, { ticker })
                        document.getElementById(`shares-${row.id}`)?.focus()
                      }}
                      className={`${inputClass} ${rowError ? 'border-error-border' : 'border-border-control'}`}
                    />
                    <input
                      id={`shares-${row.id}`}
                      aria-label={`Shares ${index + 1}`}
                      aria-invalid={Boolean(rowError)}
                      aria-describedby={describedBy}
                      placeholder="10"
                      inputMode="decimal"
                      value={row.shares}
                      onChange={(e) => updateRow(row.id, { shares: e.target.value })}
                      className={`${inputClass} ${rowError ? 'border-error-border' : 'border-border-control'}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length === 1}
                      aria-label={`Remove holding ${index + 1}`}
                      className="flex items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground transition-colors cursor-pointer disabled:invisible"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                  {rowError && <p id={errorId} className="mt-1 text-sm text-error">{rowError}</p>}
                </li>
              )
            })}
          </ul>

          <div className="mt-3 flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={addRow}
              disabled={rows.length >= MAX_HOLDINGS}
              className="text-link hover:underline cursor-pointer disabled:text-disabled-foreground disabled:no-underline disabled:cursor-not-allowed"
            >
              + Add holding
            </button>
            <span className="text-muted">{rows.length} of {MAX_HOLDINGS}</span>
          </div>

          {error && (
            <p role="alert" className="mt-6 rounded-md border border-error-border bg-error-soft px-3 py-2 text-sm text-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full px-3 py-2 bg-primary text-primary-foreground rounded-md font-130 cursor-pointer hover:bg-primary-hover active:bg-primary-active transition-colors disabled:bg-disabled-background disabled:text-disabled-foreground disabled:cursor-not-allowed"
          >
            {loading ? 'Fetching today’s prices…' : 'Create portfolio'}
          </button>
        </form>
      </main>
    </div>
  )
}
