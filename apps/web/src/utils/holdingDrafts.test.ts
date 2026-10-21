import { expect, it } from 'vitest'
import { ApiError } from '../services/api'
import { createPortfolioErrorMessage, validateHoldingDrafts } from './holdingDrafts'

const row = (ticker: string, shares: string, id = 0) => ({ id, ticker, shares })

it('reports each invalid row and skips blank rows', () => {
  const { errors, holdings } = validateHoldingDrafts([
    row(' aapl ', '2.5'),
    row('', ''),
    row('', '3'),
    row('AAPL', '1'),
    row('MSFT', '0'),
    row('NVDA', 'ten'),
  ])
  expect(errors).toEqual([
    null,
    null,
    'Enter a ticker.',
    'AAPL is already listed.',
    'Enter a share count above zero.',
    'Enter a share count above zero.',
  ])
  expect(holdings[0]).toEqual({ ticker: 'AAPL', shares: 2.5 })
})

it('passes through client errors but replaces price outages', () => {
  const unknown = "Ticker 'ZZZZ' does not exist. Please check the symbol and try again."
  expect(createPortfolioErrorMessage(new ApiError(unknown, 404))).toBe(unknown)
  expect(createPortfolioErrorMessage(new ApiError('No stock data returned', 503)))
    .toBe("Today's prices couldn't be fetched. Try again in a moment.")
})
