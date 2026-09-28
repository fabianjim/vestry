import { marketDayBoundary } from '../utils/calendarSelection'
import type { Holding, PortfolioHistoryPoint } from '../types/portfolio'
import type { StockData, StockHistoryPoint } from '../types/stock'
import type { PnLSummary, Transaction } from '../types/transaction'
import type { WatchlistItem } from '../types/watchlist'

const API_BASE = '/api';

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  credentials?: RequestCredentials
  signal?: AbortSignal
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

type AuthFailureListener = (error: ApiError, endpoint: string) => void
const authFailureListeners = new Set<AuthFailureListener>()

export function onAuthFailure(listener: AuthFailureListener) {
  authFailureListeners.add(listener)
  return () => { authFailureListeners.delete(listener) }
}

async function apiClient(endpoint: string, options: FetchOptions = {}) {
  // Associate failures with the session that started the request, not a later login.
  const listeners = [...authFailureListeners]
  const { method = 'GET', body, credentials = 'include', signal } = options

  const config: RequestInit = {
    method,
    credentials,
    signal,
    headers: {
      'Content-Type': 'application/json',
    },
  }

  if (body) {
    config.body = JSON.stringify(body)
  }

  const response = await fetch(`${API_BASE}${endpoint}`, config)

  if (!response.ok) {
    const raw = await response.text()
    let message = raw || `HTTP ${response.status}: ${response.statusText}`

    try {
      const payload: unknown = JSON.parse(raw)
      if (
        typeof payload === 'object' &&
        payload !== null &&
        'error' in payload &&
        typeof payload.error === 'string'
      ) {
        message = payload.error
      } else if (typeof payload === 'object' && payload !== null &&
        'message' in payload && typeof payload.message === 'string') {
        message = payload.message
      }
    } catch {
      // Preserve the fallback for non-JSON error responses.
    }

    const error = new ApiError(message, response.status)
    if (error.status === 401 || error.status === 403) {
      listeners.forEach(listener => listener(error, endpoint))
    }
    throw error
  }

  // Handle empty responses
  const contentType = response.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    return response.json()
  }

  return null
}

// Portfolio API
export const portfolioApi = {
  createPortfolio: (holdings: Array<{ ticker: string; shares: number }>) =>
    apiClient('/portfolio/create', { method: 'POST', body: { holdings } }),

  getHoldings: (signal?: AbortSignal): Promise<Holding[]> =>
    apiClient('/portfolio/holdings', { signal }),

  addHolding: (ticker: string, shares: number, price?: number, timestamp?: string) =>
    apiClient('/portfolio/holdings/add', { method: 'POST', body: { ticker, shares, price, timestamp } }),

  removeHolding: (ticker: string, price?: number, timestamp?: string) =>
    apiClient('/portfolio/holdings/remove', { method: 'POST', body: { ticker, price, timestamp } }),

  sellHolding: (ticker: string, shares: number, price?: number, timestamp?: string) =>
    apiClient('/portfolio/holdings/sell', { method: 'POST', body: { ticker, shares, price, timestamp } }),

  portfolioExists: () =>
    apiClient('/portfolio/exists'),

  getPortfolioHistory: (signal?: AbortSignal): Promise<PortfolioHistoryPoint[]> =>
    apiClient('/portfolio/history', { signal }),

  getTransactions: (signal?: AbortSignal): Promise<Transaction[]> =>
    apiClient('/portfolio/transactions', { signal }),

  getPnLSummary: (signal?: AbortSignal): Promise<PnLSummary> =>
    apiClient('/portfolio/pnl', { signal }),
}

// Stock API
export const stockApi = {
  getUpdateSchedule: (): Promise<{ nextUpdate: string }> =>
    apiClient('/stock/schedule'),

  fetchInitial: () =>
    apiClient('/stock/fetch/initial'),

  getStockData: (ticker: string, signal?: AbortSignal): Promise<StockData> =>
    apiClient(`/stock/data/${ticker}`, { signal }),

  getHistoricalData: (ticker: string, from?: string, signal?: AbortSignal): Promise<StockHistoryPoint[]> => {
    const queryParams = from ? `?from=${encodeURIComponent(from)}` : ''
    return apiClient(`/stock/history/${ticker}${queryParams}`, { signal })
  },
}

import type { CalendarDay, Tag, CreateJournalEntryRequest, JournalEntry, JournalFilters, UpdateJournalEntryRequest } from '../types/journal'

// Journal API
export const journalApi = {
  createEntry: (entry: CreateJournalEntryRequest) =>
    apiClient('/journal', { method: 'POST', body: entry }),

  getEntries: (signal?: AbortSignal): Promise<JournalEntry[]> =>
    apiClient('/journal', { signal }),

  getEntry: (id: number, signal?: AbortSignal): Promise<JournalEntry> =>
    apiClient(`/journal/entries/${id}`, { signal }),

  getEntriesForTicker: (ticker: string, signal?: AbortSignal): Promise<JournalEntry[]> =>
    apiClient(`/journal/${encodeURIComponent(ticker)}`, { signal }),

  getEntriesInRange: (from: string, to: string, signal?: AbortSignal): Promise<JournalEntry[]> =>
    apiClient(`/journal/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { signal }),

  getFilteredEntries: (params: JournalFilters, signal?: AbortSignal): Promise<JournalEntry[]> => {
    const searchParams = new URLSearchParams()
    if (params.from) searchParams.set('from', marketDayBoundary(params.from))
    if (params.to) searchParams.set('to', marketDayBoundary(params.to, true))
    params.dates?.forEach(date => searchParams.append('dates', date))
    if (params.query) searchParams.set('query', params.query)
    params.types?.forEach((t) => searchParams.append('types', t))
    params.tagIds?.forEach((id) => searchParams.append('tagIds', id.toString()))
    const queryString = searchParams.toString()
    return apiClient(`/journal/filtered${queryString ? '?' + queryString : ''}`, { signal })
  },

  getCalendarEntries: (year: number, month: number, filters?: JournalFilters, signal?: AbortSignal): Promise<CalendarDay[]> => {
    const params = new URLSearchParams()
    params.set('year', year.toString())
    params.set('month', month.toString())
    if (filters?.from) params.set('from', filters.from)
    if (filters?.to) params.set('to', filters.to)
    if (filters?.query) params.set('query', filters.query)
    filters?.types?.forEach((t) => params.append('types', t))
    filters?.tagIds?.forEach((id) => params.append('tagIds', id.toString()))
    return apiClient(`/journal/calendar?${params.toString()}`, { signal })
  },

  deleteEntry: (id: number) =>
    apiClient(`/journal/${id}`, { method: 'DELETE' }),

  updateEntry: (id: number, body: UpdateJournalEntryRequest) =>
    apiClient(`/journal/${id}`, { method: 'PUT', body }),

  getPopularTags: (query: string, signal?: AbortSignal): Promise<Tag[]> =>
    apiClient(`/journal/tags/popular?query=${encodeURIComponent(query)}`, { signal }),

  deleteTag: (id: number) =>
    apiClient(`/journal/tags/${id}`, { method: 'DELETE' }),
}

// Watchlist API
export const watchlistApi = {
  addToWatchlist: (ticker: string) =>
    apiClient('/watchlist', { method: 'POST', body: { ticker } }),

  getWatchlist: (signal?: AbortSignal): Promise<WatchlistItem[]> =>
    apiClient('/watchlist', { signal }),

  removeFromWatchlist: (ticker: string) =>
    apiClient(`/watchlist/${encodeURIComponent(ticker)}`, { method: 'DELETE' }),
}

// Auth API
export const authApi = {
  login: (username: string, password: string) =>
    apiClient('/auth/login', { method: 'POST', body: { username, password } }),

  register: (username: string, password: string) =>
    apiClient('/auth/register', { method: 'POST', body: { username, password } }),

  logout: () =>
    apiClient('/auth/logout', { method: 'POST' }),

  me: (signal?: AbortSignal): Promise<SessionUser> =>
    apiClient('/auth/me', { signal }),

  sessionStatus: (signal?: AbortSignal): Promise<{ authenticated: boolean }> =>
    apiClient('/auth/session-status', { signal }),
}

// Demo API
export const demoApi = {
  status: () =>
    apiClient('/portfolio/demo-status'),
}

export default apiClient

export type SessionUser = { userId: number; username: string; isDemo: boolean }
