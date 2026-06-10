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

// Journal API
export const journalApi = {
  createEntry: (entry: { entryType: string; body: string; ticker?: string | null; timestamp?: string; priceSnapshot?: number }) =>
    apiClient('/journal', { method: 'POST', body: entry }),

  getEntries: () =>
    apiClient('/journal'),

  getEntriesForTicker: (ticker: string) =>
    apiClient(`/journal/${ticker}`),

  getEntriesInRange: (from: string, to: string) =>
    apiClient(`/journal/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  deleteEntry: (id: number) =>
    apiClient(`/journal/${id}`, { method: 'DELETE' }),

  updateEntry: (id: number, body: string) =>
    apiClient(`/journal/${id}`, { method: 'PUT', body: { body } }),
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
}

export default apiClient
