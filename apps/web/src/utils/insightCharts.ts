import type { Behavior, BehaviorTrade } from '../types/insights'
import type { Holding, PortfolioHistoryPoint } from '../types/portfolio'
import type { StockHistoryPoint } from '../types/stock'
import { marketDay } from './dateUtils'
import { positionOf, type Month } from './insights'

// Chart data for a behavior card. Every x is a position from 0 to 1 across the report's months (see positionOf),
// so a chart lines up with the evidence strip under it. Nothing here is AI output.

export type Visual = 'prices' | 'portfolio' | 'risk'

const VISUALS: Record<string, Visual> = {
  price_action: 'prices', run_up: 'prices', hype: 'prices', fomo: 'prices', overconfidence: 'prices',
  short_term: 'prices', no_plan: 'prices', emotional: 'prices', loss_aversion: 'prices',
  position_sizing: 'portfolio', undocumented: 'portfolio', overtrading: 'portfolio',
  risk_concentration: 'risk',
}

export const visualFor = (kind: string): Visual | null => VISUALS[kind] ?? null

// at most this many tickers share a price chart, the most traded first
export const MAX_TICKERS = 3

type Trade = { tradeId: number; ticker: string; side: 'BUY' | 'SELL'; shares: number; price: number; date: string }

/** The behavior's trades that still exist, oldest first. */
export function groupTrades(behavior: Pick<Behavior, 'trades'>): Trade[] {
  return (behavior.trades ?? [])
    .filter((t): t is BehaviorTrade & { ticker: string; shares: number; price: number; timestamp: string } =>
      t.tradeExists && !!t.ticker && t.shares != null && t.price != null && !!t.timestamp && (t.side === 'BUY' || t.side === 'SELL'))
    .map(t => ({ tradeId: t.tradeId, ticker: t.ticker, side: t.side as 'BUY' | 'SELL', shares: t.shares, price: t.price, date: marketDay(t.timestamp) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.tradeId - b.tradeId)
}

/** The tickers a price chart shows: the most traded in the group, ties by the earliest trade. */
export function chartTickers(trades: Trade[]): string[] {
  const counts = new Map<string, number>()
  trades.forEach(t => counts.set(t.ticker, (counts.get(t.ticker) ?? 0) + 1))
  return [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!).slice(0, MAX_TICKERS)
}

/** The last stored price of each New York day, oldest first. */
export function dailyCloses(points: StockHistoryPoint[]): { date: string; close: number }[] {
  const byDay = new Map<string, { at: number; close: number }>()
  for (const point of points) {
    if (!(point.currentPrice > 0)) continue
    const at = Date.parse(point.timestamp)
    const date = marketDay(point.timestamp)
    const seen = byDay.get(date)
    if (!seen || at >= seen.at) byDay.set(date, { at, close: point.currentPrice })
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, { close }]) => ({ date, close }))
}

export type Point = { x: number; y: number; date: string }
export type TradeMark = Point & { side: 'BUY' | 'SELL'; ticker: string; price: number; shares: number; size: number }
/** A closed position from its first trade in the group to the sale that ended it. */
export type Span = { ticker: string; x1: number; x2: number; gain: boolean }

export type PriceChart = {
  // one ticker reads in dollars; several are compared as change from each one's first decision
  unit: 'price' | 'change'
  // how many tickers the group traded, when that's more than the chart shows
  hidden: number
  series: { ticker: string; points: Point[] }[]
  marks: TradeMark[]
  spans: Span[]
}

const place = <T extends { date: string }>(items: T[], months: Month[]) =>
  items.flatMap(item => {
    const x = positionOf(item.date, months)
    return x == null ? [] : [{ ...item, x }]
  })

export function priceChart(
  behavior: Pick<Behavior, 'kind' | 'trades'>,
  histories: Record<string, StockHistoryPoint[] | undefined>,
  months: Month[],
): PriceChart | null {
  const trades = groupTrades(behavior)
  const tickers = chartTickers(trades)
  if (!tickers.length) return null
  const unit = tickers.length === 1 ? 'price' : 'change'
  const base = new Map(tickers.map(ticker => [ticker, trades.find(t => t.ticker === ticker)!.price]))
  const value = (ticker: string, price: number) => (unit === 'price' ? price : price / base.get(ticker)! - 1)

  const series = tickers.flatMap(ticker => {
    const points = place(dailyCloses(histories[ticker] ?? []), months).map(({ x, date, close }) => ({ x, date, y: value(ticker, close) }))
    return points.length ? [{ ticker, points }] : []
  })
  if (!series.length) return null

  const shown = trades.filter(t => tickers.includes(t.ticker))
  const marks = place(shown, months).map(t => ({
    x: t.x, date: t.date, y: value(t.ticker, t.price), side: t.side, ticker: t.ticker, price: t.price, shares: t.shares, size: 1,
  }))
  const hidden = new Set(trades.map(t => t.ticker)).size - tickers.length
  return { unit, hidden, series, marks, spans: behavior.kind === 'loss_aversion' ? closedSpans(shown, months) : [] }
}

/** Each closed position, from its first trade to the sale that brought it to zero, against its average cost. */
function closedSpans(trades: Trade[], months: Month[]): Span[] {
  const spans: Span[] = []
  const open = new Map<string, { shares: number; cost: number; from: string }>()
  for (const t of trades) {
    const held = open.get(t.ticker) ?? { shares: 0, cost: 0, from: t.date }
    if (t.side === 'BUY') {
      open.set(t.ticker, { shares: held.shares + t.shares, cost: held.cost + t.shares * t.price, from: held.shares > 0 ? held.from : t.date })
      continue
    }
    if (held.shares <= 0) continue
    const average = held.cost / held.shares
    const left = held.shares - t.shares
    if (left > 1e-9) {
      open.set(t.ticker, { shares: left, cost: average * left, from: held.from })
      continue
    }
    open.delete(t.ticker)
    const [x1, x2] = [positionOf(held.from, months), positionOf(t.date, months)]
    if (x1 != null && x2 != null) spans.push({ ticker: t.ticker, x1, x2, gain: t.price > average })
  }
  return spans
}

export type PortfolioChart = { points: Point[]; marks: TradeMark[] }

/** Portfolio value at each New York day's close, with the group's trades on the line; sized by amount when asked. */
export function portfolioChart(
  behavior: Pick<Behavior, 'trades'>,
  history: PortfolioHistoryPoint[] | undefined,
  months: Month[],
  sized: boolean,
): PortfolioChart | null {
  const byDay = new Map<string, { at: number; value: number }>()
  for (const point of history ?? []) {
    const at = Date.parse(point.timestamp)
    const date = marketDay(point.timestamp)
    const seen = byDay.get(date)
    if (!seen || at >= seen.at) byDay.set(date, { at, value: point.portfolioValue })
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, { value }]) => ({ date, value }))
  const points = place(days, months).map(({ x, date, value }) => ({ x, date, y: value }))
  if (!points.length) return null

  const trades = groupTrades(behavior)
  const largest = Math.max(...trades.map(t => t.shares * t.price), 0)
  // a trade sits on the line at its day's value, or the last one before it
  const valueOn = (date: string) => [...points].reverse().find(p => p.date <= date)?.y ?? points[0].y
  const marks = place(trades, months).map(t => ({
    x: t.x, date: t.date, y: valueOn(t.date), side: t.side, ticker: t.ticker, price: t.price, shares: t.shares,
    size: sized && largest > 0 ? Math.sqrt((t.shares * t.price) / largest) : 1,
  }))
  return { points, marks }
}

export type RiskChart = {
  // one per month, as wide as the evidence strip's months; null where no price was stored
  bars: { key: string; label: string; move: number | null; worse: boolean }[]
  badMonth: number
}

/**
 * What the group's open holdings would have gained or lost each month at today's size, against the "bad month"
 * figure, which is worked out the same way from today's value.
 */
export function riskChart(
  behavior: Pick<Behavior, 'trades'>,
  histories: Record<string, StockHistoryPoint[] | undefined>,
  holdings: Holding[] | undefined,
  months: Month[],
  possibleLoss: number | undefined,
): RiskChart | null {
  if (possibleLoss == null || !(possibleLoss > 0)) return null
  const shares = new Map((holdings ?? []).map(h => [h.ticker.toUpperCase(), h.shares]))
  const tickers = [...new Set(groupTrades(behavior).map(t => t.ticker))].filter(t => (shares.get(t) ?? 0) > 0)
  if (!tickers.length) return null
  const closes = new Map(tickers.map(ticker => [ticker, dailyCloses(histories[ticker] ?? [])]))

  const bars = months.map(({ key, label }) => {
    let move: number | null = null
    for (const ticker of tickers) {
      const days = closes.get(ticker)!
      const inMonth = days.filter(d => d.date.startsWith(key))
      if (!inMonth.length) continue
      const before = [...days].reverse().find(d => d.date < `${key}-01`)
      const start = (before ?? inMonth[0]).close
      move = (move ?? 0) + shares.get(ticker)! * (inMonth[inMonth.length - 1].close - start)
    }
    return { key, label, move, worse: move != null && move < -possibleLoss }
  })
  return bars.some(b => b.move != null) ? { bars, badMonth: possibleLoss } : null
}
