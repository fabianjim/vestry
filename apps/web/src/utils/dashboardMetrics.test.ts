import { describe, expect, it } from 'vitest'
import type { ValuedHolding } from './holdingsAnalysis'
import { buildTimeline } from './chartData'
import { dashboardMetrics, sinceLastTrade } from './dashboardMetrics'
import type { Transaction } from '../types/transaction'

const holding = (ticker: string, shares: number, price: number, prevClose = price): ValuedHolding => ({
  ticker, shares,
  stockData: {
    stock: { ticker, currentPrice: price, prevClose, open: price, high: price, low: price, timestamp: '2026-10-01T20:00:00Z' },
    stale: false, staleWarning: null, lastSuccessfulFetch: null, eod: true,
  },
})
const pnl = { totalPnL: 25, totalPnLPercent: 5, unrealizedPnL: 15, unrealizedPnLPercent: 3, realizedPnL: 10, realizedPnLPercent: 2 }

describe('dashboard summary metrics', () => {
  it('weights daily changes by shares and reuses the supplied P/L results', () => {
    const result = dashboardMetrics([holding('A', 2, 120, 100), holding('B', 3, 80, 100)], pnl)
    expect(result.value.value).toBe(480)
    expect(result['day-change'].value).toBe(-20)
    expect(result['day-change'].percent).toBe(-4)
    expect(result['largest-weight']).toMatchObject({ value: 50, detail: 'A' })
    expect(result['holding-count'].value).toBe(2)
    expect(result['total-pnl']).toMatchObject({ value: 25, percent: 5 })
    expect(result['unrealized-pnl'].value).toBe(15)
    expect(result['realized-pnl'].value).toBe(10)
  })

  it('withholds incomplete valuations without hiding realized results or holding count', () => {
    const result = dashboardMetrics([holding('A', 2, 120), { ticker: 'B', shares: 3 }], pnl)
    for (const id of ['value', 'day-change', 'largest-weight', 'total-pnl', 'unrealized-pnl'] as const) {
      expect(result[id].value).toBeNull()
    }
    expect(result['holding-count'].value).toBe(2)
    expect(result['realized-pnl'].value).toBe(10)
  })

  it('requires a valid previous close only for daily change', () => {
    const result = dashboardMetrics([holding('A', 2, 120, 0)], pnl)
    expect(result['day-change'].value).toBeNull()
    expect(result.value.value).toBe(240)
    expect(result['total-pnl'].value).toBe(25)
    expect(dashboardMetrics([holding('A', 2, NaN)], pnl).value.value).toBeNull()
  })

  it('distinguishes loading or failed holdings from a known empty portfolio', () => {
    expect(dashboardMetrics([], pnl, false)['holding-count'].value).toBeNull()
    expect(dashboardMetrics([], pnl, false).value.value).toBeNull()
    const empty = dashboardMetrics([], pnl)
    expect(empty.value.value).toBe(0)
    expect(empty['holding-count'].value).toBe(0)
    expect(empty['largest-weight'].value).toBeNull()
    expect(empty['realized-pnl'].value).toBe(10)
    expect(dashboardMetrics([], undefined)['total-pnl'].value).toBeNull()
  })

  it('measures gain since the latest trade without counting the money it moved', () => {
    const history = [
      { timestamp: '2026-10-20T14:00:00Z', portfolioValue: 1000 },
      { timestamp: '2026-10-20T15:00:00Z', portfolioValue: 1600 },
      { timestamp: '2026-10-20T16:00:00Z', portfolioValue: 1650 },
      { timestamp: '2026-10-20T17:00:00Z', portfolioValue: 1100 },
    ]
    const trade = (id: number, type: 'BUY' | 'SELL', totalValue: number, timestamp: string): Transaction =>
      ({ id, ticker: 'A', shares: 1, price: totalValue, totalValue, type, timestamp })
    const buys = [trade(1, 'BUY', 1000, '2026-10-20T13:30:00Z'), trade(2, 'BUY', 500, '2026-10-20T14:30:00Z')]
    const afterBuy = { timeline: buildTimeline(history.slice(0, 3), buys), transactions: buys }
    expect(sinceLastTrade(afterBuy)).toEqual({ amount: 150, percent: 10, day: '2026-10-20' })

    const all = [...buys, trade(3, 'SELL', 600, '2026-10-20T16:30:00Z')]
    expect(sinceLastTrade({ timeline: buildTimeline(history, all), transactions: all })?.amount).toBe(50)
    expect(dashboardMetrics([], pnl, true, afterBuy)['since-last-trade']).toMatchObject({ value: 150, percent: 10, detail: 'Oct 20' })
    expect(sinceLastTrade({ timeline: buildTimeline(history, []), transactions: [] })).toBeNull()
    expect(dashboardMetrics([], pnl)['since-last-trade'].value).toBeNull()
  })
})
