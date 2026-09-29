import { describe, expect, it } from 'vitest'
import type { JournalEntry } from '../types/journal'
import type { Transaction } from '../types/transaction'
import { concentrationSummary, holdingPnl, positionSizeReturn, reflectionOverview, type ValuedHolding } from './holdingsAnalysis'
import { DEFAULT_HOLDINGS_LAYOUT, moveHoldingsCard, type HoldingsLayout } from './holdingsLayout'

const holding = (ticker: string, price?: number): ValuedHolding => ({
  ticker, shares: 1,
  stockData: price === undefined ? undefined : {
    stock: { ticker, currentPrice: price, timestamp: '2026-09-28T14:00:00Z', open: price, high: price, low: price, prevClose: price },
    stale: false, staleWarning: null, lastSuccessfulFetch: null, eod: false,
  },
})
const entry = (ticker: string, entryType: JournalEntry['entryType'], day: number): JournalEntry => ({
  id: day, ticker, entryType, body: 'A recorded decision', timestamp: `2026-09-${day}T14:00:00Z`, priceSnapshot: null, tags: [],
})
const tx = (ticker: string, type: Transaction['type'], price: number, day: number): Transaction => ({
  id: -day, ticker, type, price, shares: 1, totalValue: price, timestamp: `2026-09-${day}T14:00:00Z`,
})

describe('holdings analysis', () => {
  it('reports incomplete concentration coverage rather than pricing missing holdings at zero', () => {
    const summary = concentrationSummary([holding('A', 100), holding('B', 300), holding('C'), holding('D', NaN)], 1)
    expect(summary).toMatchObject({
      missing: 2, largest: { ticker: 'B', weight: 75 }, topN: 1, topWeight: 75, topValue: 300, effectiveHoldings: 1.6,
    })
    expect(summary.rows.map(row => [row.ticker, row.cumulativeWeight])).toEqual([['B', 75], ['A', 100]])
    expect(concentrationSummary([holding('C')]).topWeight).toBeNull()
    expect(concentrationSummary([]).effectiveHoldings).toBeNull()
  })

  it('clamps a saved Top N to available holdings and gives equal-weight positions their actual effective count', () => {
    const holdings = ['A', 'B', 'C', 'D'].map(ticker => holding(ticker, 100))
    expect(concentrationSummary(holdings, 99)).toMatchObject({ topN: 4, topWeight: 100, topValue: 400, effectiveHoldings: 4 })
    expect(concentrationSummary(holdings, 2)).toMatchObject({ topN: 2, topWeight: 50, topValue: 200 })
    expect(concentrationSummary(holdings, 0).topN).toBe(1)
    expect(concentrationSummary([holding('A', 100)], 3).effectiveHoldings).toBe(1)
  })

  it('plots open returns with weights that include priced holdings lacking cost history', () => {
    const holdings = [holding('A', 180), holding('B', 120), holding('NO_HISTORY', 300), holding('NO_PRICE')]
    const transactions = [
      tx('A', 'BUY', 100, 20), tx('A', 'SELL', 150, 21), tx('A', 'BUY', 200, 22),
      tx('B', 'BUY', 100, 20), tx('NO_PRICE', 'BUY', 50, 20),
      tx('CLOSED', 'BUY', 100, 20), tx('CLOSED', 'SELL', 90, 21),
    ]
    expect(positionSizeReturn(holdings, transactions)).toEqual({
      points: [{ ticker: 'A', weight: 30, returnPercent: -10 }, { ticker: 'B', weight: 20, returnPercent: 20 }],
      missingPrices: 1, missingReturns: 1,
    })
    expect(positionSizeReturn([holding('A', 100)], [tx('A', 'BUY', 0, 20)])).toMatchObject({ points: [], missingReturns: 1 })
  })

  it('shows never-reviewed holdings first, using the latest deliberate note rather than automatic trades', () => {
    const note = entry('B', 'INSIGHT', 20)
    const reflection = entry('A', 'REFLECTION', 15)
    const result = reflectionOverview([holding('A'), holding('B'), holding('C')], [
      entry('C', 'BUY', 28), note, entry('A', 'INSIGHT', 10), reflection,
      entry('B', 'SELL', 28), entry('C', 'MARKET_EVENT', 28), entry('SOLD', 'REFLECTION', 12),
    ])
    expect(result).toEqual([{ ticker: 'C', entry: null }, { ticker: 'A', entry: reflection }, { ticker: 'B', entry: note }])
  })

  it('separates open P/L from sale results, includes closed positions, and preserves unavailable valuations', () => {
    const holdings = [holding('A', 180), holding('MISSING')]
    const transactions = [
      tx('A', 'BUY', 200, 22), tx('A', 'SELL', 150, 21), tx('A', 'BUY', 100, 20),
      tx('CLOSED', 'BUY', 100, 20), tx('CLOSED', 'SELL', 80, 21), tx('MISSING', 'BUY', 50, 20),
    ]
    expect(holdingPnl(holdings, transactions, false)).toEqual([
      { ticker: 'A', value: -20, percent: -10 }, { ticker: 'MISSING', value: null, percent: null },
    ])
    expect(holdingPnl(holdings, transactions, true)).toEqual([
      { ticker: 'A', value: 50, percent: 50 }, { ticker: 'CLOSED', value: -20, percent: -20 },
    ])
    expect(holdingPnl([holding('A', 100)], [], false)[0].value).toBeNull()
    expect(holdingPnl([], [], true)).toEqual([])
  })
})

describe('holdings layout order', () => {
  it('moves cards in either direction while retaining widths and the saved layout', () => {
    const layout: HoldingsLayout = structuredClone(DEFAULT_HOLDINGS_LAYOUT)
    const moved = moveHoldingsCard(layout, 'relationships', 'sector')
    expect(moved.cards).toEqual([['relationships', 2], ['sector', 1], ['value', 1]])
    expect(moveHoldingsCard(moved, 'relationships', 'value')).toEqual(layout)
    expect(layout).toEqual(DEFAULT_HOLDINGS_LAYOUT)
    expect(moveHoldingsCard(layout, 'realized', 'sector')).toBe(layout)
  })
})
