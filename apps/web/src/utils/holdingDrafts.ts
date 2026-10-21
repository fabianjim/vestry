import { ApiError } from '../services/api'

// Mirrors PortfolioService.MAX_HOLDINGS.
export const MAX_HOLDINGS = 8

export interface HoldingDraft {
  id: number
  ticker: string
  shares: string
}

/** Blank rows are ignored; every other row gets an error or null, in row order. */
export function validateHoldingDrafts(rows: HoldingDraft[]) {
  const seen = new Set<string>()
  const errors = rows.map(row => {
    const ticker = row.ticker.trim().toUpperCase()
    const shares = row.shares.trim()
    if (!ticker && !shares) return null
    if (!ticker) return 'Enter a ticker.'
    if (seen.has(ticker)) return `${ticker} is already listed.`
    seen.add(ticker)
    if (!shares || !(Number(shares) > 0)) return 'Enter a share count above zero.'
    return null
  })
  const holdings = rows
    .filter(row => row.ticker.trim())
    .map(row => ({ ticker: row.ticker.trim().toUpperCase(), shares: Number(row.shares) }))
  return { errors, holdings }
}

export function createPortfolioErrorMessage(failure: unknown) {
  // 404 names the unknown ticker; other client errors explain the rejected request.
  if (failure instanceof ApiError && failure.status < 500) return failure.message
  return "Today's prices couldn't be fetched. Try again in a moment."
}
