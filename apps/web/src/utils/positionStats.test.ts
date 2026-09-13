import { describe, expect, it } from 'vitest'
import type { Transaction } from '../types/transaction'
import { getPositionStats } from './positionStats'

const tx = (id: number, type: Transaction['type'], shares: number, price: number, ticker = 'AAPL'): Transaction => ({
  id, type, shares, price, ticker, totalValue: shares * price,
  timestamp: `2026-01-0${Math.abs(id)}T15:00:00Z`,
})

describe('getPositionStats', () => {
  it('uses remaining cost after a partial sale and subsequent purchase', () => {
    const history = [tx(3, 'BUY', 4, 200), tx(2, 'SELL', 4, 150), tx(1, 'BUY', 10, 100)]
    const original = [...history]
    const result = getPositionStats(history, 'AAPL', 160)!
    expect(result.shares).toBe(10)
    expect(result.averageCost).toBe(140)
    expect(result.marketValue).toBe(1600)
    expect(result.realizedGainLoss).toBe(200)
    expect(result.realizedPercent).toBe(50)
    expect(result.unrealizedGainLoss).toBe(200)
    expect(result.unrealizedPercent).toBeCloseTo(100 / 7)
    expect(history).toEqual(original)
  })

  it('retains past realized gains after reopening a demo position', () => {
    const result = getPositionStats([
      tx(-1, 'BUY', 10, 100), tx(-2, 'SELL', 10, 150), tx(-3, 'BUY', 5, 200),
      tx(-4, 'BUY', 20, 50, 'MSFT'),
    ], 'AAPL', 180)!
    expect(result.averageCost).toBe(200)
    expect(result.shares).toBe(5)
    expect(result.realizedGainLoss).toBe(500)
    expect(result.unrealizedGainLoss).toBe(-100)
    expect(result.unrealizedPercent).toBe(-10)
  })

  it('clears fractional residue when a position closes', () => {
    const result = getPositionStats([
      tx(1, 'BUY', 0.3, 100), tx(2, 'SELL', 0.1, 120), tx(3, 'SELL', 0.2, 130),
    ], 'AAPL', null)!
    expect(result.shares).toBe(0)
    expect(result.averageCost).toBeNull()
    expect(result.marketValue).toBe(0)
    expect(result.unrealizedGainLoss).toBe(0)
    expect(result.realizedGainLoss).toBeCloseTo(8)
  })

  it('does not turn a missing quote into a loss', () => {
    const result = getPositionStats([tx(1, 'BUY', 10, 100)], 'AAPL', null)!
    expect(result.averageCost).toBe(100)
    expect(result.marketValue).toBeNull()
    expect(result.unrealizedGainLoss).toBeNull()
    expect(result.unrealizedPercent).toBeNull()
    expect(result.realizedGainLoss).toBe(0)
  })

  it('returns no position when the ticker has no transactions', () => {
    expect(getPositionStats([], 'AAPL', 100)).toBeNull()
    expect(getPositionStats([tx(1, 'BUY', 10, 100, 'MSFT')], 'AAPL', 100)).toBeNull()
  })
})
