import { describe, it, expect } from 'vitest'
import { axisTicks, buildTimeline, dailyCloses, dateEntries, formatDateWindow, selectDates, selectRange, toRows, yDomain } from './chartData'
import type { Transaction } from '../types/transaction'
import type { JournalEntry } from '../types/journal'

// Timestamps are UTC; New York is UTC-4 in May.
const at = (day: string, hour: number, minute = 0, second = 0) =>
  `2026-05-${day}T${String(hour + 4).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}Z`
const observe = (day: string, hour: number, portfolioValue: number, minute = 0) => ({ timestamp: at(day, hour, minute), portfolioValue })
let nextId = 1
const trade = (timestamp: string, type: 'BUY' | 'SELL', totalValue: number, ticker = 'CAVA'): Transaction =>
  ({ id: nextId++, ticker, type, shares: 1, price: totalValue, totalValue, timestamp })
const entry = (id: number, timestamp: string, sourceEntryId?: number): JournalEntry =>
  ({ id, entryType: 'INSIGHT', body: '', ticker: null, timestamp, priceSnapshot: null, tags: [], sourceEntryId })

describe('buildTimeline', () => {
  it('steps at each trade between fetches and tracks money in, so gain is unchanged by trading', () => {
    const timeline = buildTimeline(
      [observe('21', 11, 10000), observe('21', 12, 10850)],
      [trade(at('21', 11, 15), 'BUY', 1000), trade(at('21', 11, 30), 'SELL', 500), trade(at('21', 11, 45), 'SELL', 2000)],
    )

    expect(timeline.map(p => p.value)).toEqual([10000, 11000, 10500, 8500, 10850])
    expect(timeline.map(p => p.invested)).toEqual([0, 1000, 500, -1500, -1500])
    expect(timeline.slice(0, 4).map(p => p.value - p.invested)).toEqual([10000, 10000, 10000, 10000])
    expect(timeline[1].time).toBe(new Date(at('21', 11, 15)).getTime())
    expect(timeline[1].trades).toHaveLength(1)
    expect(timeline[4].trades).toHaveLength(0)
  })

  it('collapses same-type trades within two minutes, but not opposite types or later trades', () => {
    const timeline = buildTimeline([observe('21', 11, 10000)], [
      trade(at('21', 11, 15, 10), 'BUY', 1500),
      trade(at('21', 11, 15, 40), 'BUY', 1000),
      trade(at('21', 11, 16, 30), 'BUY', 500),
      trade(at('21', 11, 16, 45), 'SELL', 400),
      trade(at('21', 11, 20), 'SELL', 100),
    ])

    expect(timeline.map(p => p.value)).toEqual([10000, 13000, 12600, 12500])
    expect(timeline[1].time).toBe(new Date(at('21', 11, 16, 30)).getTime())
    expect(timeline[1].trades).toHaveLength(3)
    expect(timeline.map(p => p.invested)).toEqual([0, 3000, 2600, 2500])
  })

  it('lets a fetch that already reflects a trade carry the step, as the server buckets by minute', () => {
    const timeline = buildTimeline(
      [observe('21', 10, 5000, 15), observe('21', 11, 5600)],
      // Portfolio creation lands in the 10:15 bucket; the 11:00 buy is inside the 11:00 bucket.
      [trade(at('21', 10, 15, 20), 'BUY', 5000), trade(at('21', 11, 0, 30), 'BUY', 500)],
    )

    expect(timeline.map(p => p.value)).toEqual([5000, 5600])
    expect(timeline.map(p => p.invested)).toEqual([5000, 5500])
    expect(timeline.map(p => p.trades.length)).toEqual([1, 1])
  })
})

describe('dailyCloses', () => {
  it('keeps the last point of each New York day with all of its trades', () => {
    const timeline = buildTimeline(
      // 19:30 New York on the 20th is already the 21st in UTC.
      [observe('20', 15, 100), observe('20', 19, 110, 30), observe('21', 15, 120)],
      [trade(at('20', 15, 10), 'BUY', 5), trade(at('20', 15, 20), 'BUY', 5)],
    )
    const closes = dailyCloses(timeline)

    expect(closes.map(p => [p.day, p.value])).toEqual([['2026-05-20', 110], ['2026-05-21', 120]])
    expect(closes[0].trades).toHaveLength(2)
  })
})

describe('selectRange', () => {
  const timeline = buildTimeline(
    [observe('01', 15, 100), observe('19', 15, 110), observe('20', 11, 111), observe('20', 15, 112), observe('21', 11, 120), observe('21', 15, 125)],
    [],
  )
  const closes = dailyCloses(timeline)

  it('shows the latest day measured from the previous close', () => {
    const latest = selectRange(timeline, closes, '1D')
    expect(latest.points.map(p => p.value)).toEqual([120, 125])
    expect(latest.baseline?.value).toBe(112)
    expect(latest.resolution).toBe('day')
  })

  it('opens longer ranges on the close before the window, and All on the first close', () => {
    const week = selectRange(timeline, closes, '1W')
    expect(week.points.map(p => p.value)).toEqual([100, 110, 111, 112, 120, 125])
    expect(week.baseline?.value).toBe(100)

    expect(selectRange(timeline, closes, '1M').points.map(p => p.value)).toEqual([100, 110, 112, 125])
    expect(selectRange(timeline, closes, '1M').baseline).toBeUndefined()
    expect(selectRange(timeline, closes, 'ALL')).toEqual({ points: closes, resolution: 'long' })
  })
})

describe('selectDates', () => {
  const timeline = buildTimeline(
    [observe('01', 15, 100), observe('19', 15, 110), observe('20', 11, 111), observe('20', 15, 112), observe('21', 11, 120), observe('21', 15, 125)],
    [],
  )
  const closes = dailyCloses(timeline)

  it('plots every observation up to a week and daily closes beyond, from the close before', () => {
    const day = selectDates(timeline, closes, { from: '2026-05-20', to: '2026-05-20' })
    expect(day.points.map(p => p.value)).toEqual([111, 112])
    expect(day.baseline?.value).toBe(110)
    expect(day.resolution).toBe('day')

    const days = selectDates(timeline, closes, { from: '2026-05-19', to: '2026-05-20' })
    expect(days.points.map(p => p.value)).toEqual([110, 111, 112])
    expect(days.resolution).toBe('week')

    const month = selectDates(timeline, closes, { from: '2026-05-01', to: '2026-05-21' })
    expect(month.points.map(p => p.value)).toEqual([100, 110, 112, 125])
    expect(month.baseline).toBeUndefined()
    expect(month.resolution).toBe('month')

    expect(selectDates(timeline, closes, { from: '2026-05-22', to: '2026-05-22' }).points).toEqual([])
  })

  it('labels one day or a span, with years only when they differ', () => {
    expect(formatDateWindow({ from: '2026-10-16', to: '2026-10-16' })).toBe('Fri, Oct 16')
    expect(formatDateWindow({ from: '2026-09-01', to: '2026-10-16' })).toBe('Sep 1 – Oct 16')
    expect(formatDateWindow({ from: '2026-12-28', to: '2027-01-04' })).toBe('Dec 28, 2026 – Jan 4, 2027')
  })
})

describe('toRows', () => {
  const timeline = buildTimeline(
    [observe('22', 11, 1000), observe('22', 15, 1100), observe('26', 11, 1200), observe('26', 15, 1150)],
    [],
  )

  it('measures gain from the baseline and places entries on the point that covers them', () => {
    const closes = dailyCloses(timeline)
    // Friday's entry, a Saturday entry (Monday was a holiday, so it lands on Tuesday) and one outside the range.
    const entries = dateEntries([entry(3, at('23', 10)), entry(1, at('22', 12)), entry(2, at('29', 10))])
    const rows = toRows(closes, closes[0], entries, 'month')

    expect(rows.map(r => r.gain)).toEqual([0, 50])
    expect(rows.map(r => r.x)).toEqual([0, 1])
    expect(rows.map(r => r.entries.map(e => e.id))).toEqual([[1], [3]])
  })

  it('places intraday entries on the next observation, or the day’s last one', () => {
    const { points, baseline, resolution } = selectRange(timeline, dailyCloses(timeline), '1D')
    const rows = toRows(points, baseline, dateEntries([entry(1, at('26', 12)), entry(2, at('26', 17))]), resolution)

    expect(rows.map(r => r.entries.map(e => e.id))).toEqual([[], [1, 2]])
    expect(rows[0].x).toBe(rows[0].time)
    expect(rows.map(r => r.gain)).toEqual([100, 50])
  })
})

describe('yDomain', () => {
  it('shares the axis with a nearby reference series, and leaves out one that would flatten the line', () => {
    const [low, high] = yDomain([100, 200], [80, 210])
    expect(low).toBeLessThan(80)
    expect(high).toBeGreaterThan(210)

    const [farLow, farHigh] = yDomain([100, 200], [80, 400])
    expect(farLow).toBeGreaterThan(80)
    expect(farHigh).toBeLessThan(400)
  })
})

describe('axisTicks', () => {
  it('labels month starts on long ranges without labelling the mid-month first point', () => {
    const timeline = buildTimeline(
      ['2026-04-28', '2026-05-01', '2026-06-01', '2026-06-02'].map(day => ({ timestamp: `${day}T19:00:00Z`, portfolioValue: 1 })),
      [],
    )
    const rows = toRows(dailyCloses(timeline), undefined, [], 'long')
    const { ticks, labels } = axisTicks(rows, 'long')

    expect(ticks).toEqual([1, 2])
    expect(ticks.map(tick => labels.get(tick))).toEqual(['May', 'Jun'])
  })
})
