const API_BASE = '/api';

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  credentials?: RequestCredentials
}

async function apiClient(endpoint: string, options: FetchOptions = {}) {
  const { method = 'GET', body, credentials = 'include' } = options

  const config: RequestInit = {
    method,
    credentials,
    headers: {
      'Content-Type': 'application/json',
    },
  }

  if (body) {
    config.body = JSON.stringify(body)
  }

  const response = await fetch(`${API_BASE}${endpoint}`, config)

  if (!response.ok) {
    const error = await response.text()
    throw new Error(error || `HTTP ${response.status}: ${response.statusText}`)
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

  getHoldings: () =>
    apiClient('/portfolio/holdings'),

  addHolding: (ticker: string, shares: number, price?: number, timestamp?: string) =>
    apiClient('/portfolio/holdings/add', { method: 'POST', body: { ticker, shares, price, timestamp } }),

  removeHolding: (ticker: string, price?: number, timestamp?: string) =>
    apiClient('/portfolio/holdings/remove', { method: 'POST', body: { ticker, price, timestamp } }),

  sellHolding: (ticker: string, shares: number, price?: number, timestamp?: string) =>
    apiClient('/portfolio/holdings/sell', { method: 'POST', body: { ticker, shares, price, timestamp } }),

  portfolioExists: () =>
    apiClient('/portfolio/exists'),

  getPortfolioHistory: () =>
    apiClient('/portfolio/history'),

  getTransactions: () =>
    apiClient('/portfolio/transactions'),

  getPnLSummary: () =>
    apiClient('/portfolio/pnl'),
}

// Stock API
export const stockApi = {
  fetchInitial: () =>
    apiClient('/stock/fetch/initial'),

  getStockData: (ticker: string) =>
    apiClient(`/stock/data/${ticker}`),

  getHistoricalData: (ticker: string, from?: string) => {
    const queryParams = from ? `?from=${encodeURIComponent(from)}` : ''
    return apiClient(`/stock/history/${ticker}${queryParams}`)
  },
}

import type { CalendarDay, CreateJournalEntryRequest, JournalFilters, UpdateJournalEntryRequest } from '../types/journal'

// Journal API
export const journalApi = {
  createEntry: (entry: CreateJournalEntryRequest) =>
    apiClient('/journal', { method: 'POST', body: entry }),

  getEntries: () =>
    apiClient('/journal'),

  getEntriesForTicker: (ticker: string) =>
    apiClient(`/journal/${ticker}`),

  getEntriesInRange: (from: string, to: string) =>
    apiClient(`/journal/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  getFilteredEntries: (params: {
    from?: string
    to?: string
    types?: string[]
    ticker?: string
    tagIds?: number[]
    query?: string
  }) => {
    const searchParams = new URLSearchParams()
    if (params.from) searchParams.set('from', params.from)
    if (params.to) searchParams.set('to', params.to)
    if (params.ticker) searchParams.set('ticker', params.ticker)
    if (params.query) searchParams.set('query', params.query)
    params.types?.forEach((t) => searchParams.append('types', t))
    params.tagIds?.forEach((id) => searchParams.append('tagIds', id.toString()))
    const queryString = searchParams.toString()
    return apiClient(`/journal/filtered${queryString ? '?' + queryString : ''}`)
  },

  getCalendarEntries: (year: number, month: number, filters?: JournalFilters) => {
    const params = new URLSearchParams()
    params.set('year', year.toString())
    params.set('month', month.toString())
    if (filters?.from) params.set('from', filters.from)
    if (filters?.to) params.set('to', filters.to)
    if (filters?.ticker) params.set('ticker', filters.ticker)
    if (filters?.query) params.set('query', filters.query)
    filters?.types?.forEach((t) => params.append('types', t))
    filters?.tagIds?.forEach((id) => params.append('tagIds', id.toString()))
    return apiClient(`/journal/calendar?${params.toString()}`) as Promise<CalendarDay[]>
  },

  deleteEntry: (id: number) =>
    apiClient(`/journal/${id}`, { method: 'DELETE' }),

  updateEntry: (id: number, body: UpdateJournalEntryRequest) =>
    apiClient(`/journal/${id}`, { method: 'PUT', body }),

  getPopularTags: (query: string) =>
    apiClient(`/journal/tags/popular?query=${encodeURIComponent(query)}`),

  deleteTag: (id: number) =>
    apiClient(`/journal/tags/${id}`, { method: 'DELETE' }),
}

// Watchlist API
export const watchlistApi = {
  addToWatchlist: (ticker: string) =>
    apiClient('/watchlist', { method: 'POST', body: { ticker } }),

  getWatchlist: () =>
    apiClient('/watchlist'),

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

  me: () =>
    apiClient('/auth/me'),
}

// Demo API
export const demoApi = {
  status: () =>
    apiClient('/portfolio/demo-status'),
}

export default apiClient
