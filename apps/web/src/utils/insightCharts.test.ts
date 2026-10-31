import { describe, expect, it } from 'vitest'
import type { BehaviorTrade } from '../types/insights'
import type { StockHistoryPoint } from '../types/stock'
import { chartTickers, dailyCloses, groupTrades, portfolioChart, priceChart, riskChart, visualFor } from './insightCharts'
import { positionOf, type Month } from './insights'
import { behavior } from './insights.fixtures'

const months: Month[] = [{ key: '2026-09', label: 'Sep' }, { key: '2026-10', label: 'Oct' }]
let nextId = 1
const trade = (ticker: string, side: 'BUY' | 'SELL', shares: number, price: number, timestamp: string, exists = true): BehaviorTrade => ({
  tradeId: nextId++, tradeExists: exists, ticker, side, shares, price, timestamp,
})
const price = (timestamp: string, currentPrice: number): StockHistoryPoint => ({
  timestamp, currentPrice, open: currentPrice, high: currentPrice, low: currentPrice, prevClose: currentPrice,
})
const withTrades = (kind: string, trades: BehaviorTrade[]) => behavior(kind, null, {}, { trades })

it('chooses a chart per kind, and none for kinds it doesn’t know', () => {
  expect(visualFor('price_action')).toBe('prices')
  expect(visualFor('emotional')).toBe('prices')
  expect(visualFor('position_sizing')).toBe('portfolio')
  expect(visualFor('risk_concentration')).toBe('risk')
  expect(visualFor('news_drift')).toBeNull()
})

it('keeps the last price of each New York day', () => {
  expect(dailyCloses([
    price('2026-09-01T14:00:00Z', 10), price('2026-09-01T20:30:00Z', 11),
    price('2026-09-02T02:00:00Z', 12), // 22:00 on Sep 1 in New York
    price('2026-09-02T20:30:00Z', 13), price('2026-09-03T20:30:00Z', 0),
  ])).toEqual([{ date: '2026-09-01', close: 12 }, { date: '2026-09-02', close: 13 }])
})

it('leaves out deleted trades and shows at most three tickers, the most traded first', () => {
  const trades = groupTrades(withTrades('fomo', [
    trade('AAA', 'BUY', 1, 10, '2026-09-01T15:00:00Z'), trade('BBB', 'BUY', 1, 10, '2026-09-02T15:00:00Z'),
    trade('BBB', 'BUY', 1, 10, '2026-09-03T15:00:00Z'), trade('CCC', 'BUY', 1, 10, '2026-09-04T15:00:00Z'),
    trade('DDD', 'BUY', 1, 10, '2026-09-05T15:00:00Z'), trade('EEE', 'BUY', 1, 10, '2026-09-06T15:00:00Z', false),
  ]))
  expect(trades.map(t => t.ticker)).toEqual(['AAA', 'BBB', 'BBB', 'CCC', 'DDD'])
  expect(chartTickers(trades)).toEqual(['BBB', 'AAA', 'CCC'])
})

it('says how many traded tickers a price chart leaves out', () => {
  const tickers = ['AAA', 'BBB', 'CCC', 'DDD']
  const prices = Object.fromEntries(tickers.map(t => [t, [price('2026-09-10T20:30:00Z', 10)]]))
  const four = withTrades('fomo', tickers.map(t => trade(t, 'BUY', 1, 10, '2026-09-10T15:00:00Z')))
  expect(priceChart(four, prices, months)!.hidden).toBe(1)
  expect(priceChart(withTrades('fomo', [trade('AAA', 'BUY', 1, 10, '2026-09-10T15:00:00Z')]), prices, months)!.hidden).toBe(0)
})

describe('price chart', () => {
  const history = { AAA: [price('2026-09-01T20:30:00Z', 100), price('2026-10-15T20:30:00Z', 120)], BBB: [price('2026-09-10T20:30:00Z', 50)] }

  it('reads one ticker in dollars, with each decision on the day it was made', () => {
    const chart = priceChart(withTrades('price_action', [trade('AAA', 'BUY', 2, 100, '2026-09-01T15:00:00Z'),
      trade('AAA', 'SELL', 1, 120, '2026-10-15T15:00:00Z')]), history, months)!
    expect(chart.unit).toBe('price')
    expect(chart.series[0].points.map(p => p.y)).toEqual([100, 120])
    expect(chart.marks.map(m => [m.side, m.y, m.x])).toEqual([
      ['BUY', 100, positionOf('2026-09-01', months)], ['SELL', 120, positionOf('2026-10-15', months)]])
  })

  it('compares several tickers as change from each one’s first decision', () => {
    const chart = priceChart(withTrades('emotional', [trade('AAA', 'SELL', 1, 80, '2026-09-01T15:00:00Z'),
      trade('BBB', 'SELL', 1, 40, '2026-09-10T15:00:00Z')]), history, months)!
    expect(chart.unit).toBe('change')
    expect(chart.series.find(s => s.ticker === 'AAA')!.points.map(p => p.y)).toEqual([0.25, 0.5])
    expect(chart.marks.map(m => m.y)).toEqual([0, 0])
  })

  it('leaves out prices outside the report’s months and has no chart without prices', () => {
    const early = { AAA: [price('2026-08-20T20:30:00Z', 90), price('2026-09-02T20:30:00Z', 100)] }
    const chart = priceChart(withTrades('fomo', [trade('AAA', 'BUY', 1, 100, '2026-09-02T15:00:00Z')]), early, months)!
    expect(chart.series[0].points.map(p => p.date)).toEqual(['2026-09-02'])
    expect(priceChart(withTrades('fomo', [trade('AAA', 'BUY', 1, 100, '2026-09-02T15:00:00Z')]), {}, months)).toBeNull()
    expect(priceChart(withTrades('fomo', []), history, months)).toBeNull()
  })

  it('shades each closed position for loss aversion, through partial sells and a re-buy', () => {
    const chart = priceChart(withTrades('loss_aversion', [
      trade('AAA', 'BUY', 2, 100, '2026-09-01T15:00:00Z'),
      trade('AAA', 'SELL', 1, 90, '2026-09-10T15:00:00Z'), // partial: still open
      trade('AAA', 'SELL', 1, 95, '2026-09-20T15:00:00Z'), // closes below the 100 average: a loss
      trade('AAA', 'BUY', 1, 100, '2026-10-01T15:00:00Z'),
      trade('AAA', 'SELL', 1, 120, '2026-10-15T15:00:00Z'), // re-bought and closed at a gain
    ]), history, months)!
    expect(chart.spans).toEqual([
      { ticker: 'AAA', x1: positionOf('2026-09-01', months), x2: positionOf('2026-09-20', months), gain: false },
      { ticker: 'AAA', x1: positionOf('2026-10-01', months), x2: positionOf('2026-10-15', months), gain: true },
    ])
  })
})

it('puts trades on the portfolio line at their day’s value, sized by amount when asked', () => {
  const history = [
    { timestamp: '2026-09-01T15:00:00Z', portfolioValue: 900 }, { timestamp: '2026-09-01T20:00:00Z', portfolioValue: 1000 },
    { timestamp: '2026-09-03T20:00:00Z', portfolioValue: 1500 },
  ]
  const trades = [trade('AAA', 'BUY', 1, 100, '2026-09-02T15:00:00Z'), trade('BBB', 'BUY', 4, 100, '2026-09-03T15:00:00Z')]
  const sized = portfolioChart(withTrades('position_sizing', trades), history, months, true)!
  expect(sized.points.map(p => p.y)).toEqual([1000, 1500])
  // a day with no value of its own takes the last one before it
  expect(sized.marks.map(m => [m.y, m.size])).toEqual([[1000, 0.5], [1500, 1]])
  expect(portfolioChart(withTrades('undocumented', trades), history, months, false)!.marks.map(m => m.size)).toEqual([1, 1])
  expect(portfolioChart(withTrades('undocumented', trades), [], months, false)).toBeNull()
})

describe('risk chart', () => {
  const holdings = [{ ticker: 'AAA', shares: 10 }, { ticker: 'BBB', shares: 0 }]
  const history = { AAA: [price('2026-08-31T20:30:00Z', 100), price('2026-09-30T20:30:00Z', 80), price('2026-10-15T20:30:00Z', 90)] }
  const group = withTrades('risk_concentration', [trade('AAA', 'BUY', 10, 100, '2026-08-01T15:00:00Z'), trade('BBB', 'BUY', 1, 10, '2026-08-01T15:00:00Z')])

  it('moves each month at today’s size, from the last close before it, and flags the months past a bad month', () => {
    const chart = riskChart(group, history, holdings, months, 150)!
    expect(chart.badMonth).toBe(150)
    expect(chart.bars.map(b => [b.key, b.move, b.worse])).toEqual([['2026-09', -200, true], ['2026-10', 100, false]])
  })

  it('has no chart without a bad-month figure, an open holding or prices', () => {
    expect(riskChart(group, history, holdings, months, undefined)).toBeNull()
    expect(riskChart(group, history, [], months, 150)).toBeNull()
    expect(riskChart(group, {}, holdings, months, 150)).toBeNull()
  })
})
