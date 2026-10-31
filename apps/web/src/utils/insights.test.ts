import { describe, expect, it } from 'vitest'
import type { Behavior } from '../types/insights'
import type { JournalEntry } from '../types/journal'
import {
  behaviorName, behaviorTitle, blockedReason, consequence, evidenceTimeline, isKnownKind, kindFacts, needHint,
  paneKey, reportDayLong, shownBehaviors, sinceLast,
} from './insights'
import { behavior, demoReport } from './insights.fixtures'

const [priceAction, anxious, concentration, sizing] = demoReport.behaviors

describe('behavior titles', () => {
  it('gives each kind an observable title and its common name', () => {
    expect(behaviorTitle(priceAction)).toBe('Buying because the price was moving')
    expect(behaviorName(priceAction)).toBe('Momentum chasing')
    expect(behaviorTitle(anxious)).toBe('Decisions where you wrote about feeling anxious')
    expect(behaviorTitle({ kind: 'emotional', subject: 'fomo' })).toBe('Decisions where you wrote about feeling FOMO')
    expect(behaviorTitle({ kind: 'emotional', subject: null })).toBe('Decisions made under a strong feeling')
    expect(behaviorTitle({ kind: 'news_drift', subject: null })).toBe('')
  })

  it('shows only the kinds it can word, in hindsight’s order', () => {
    expect(shownBehaviors(demoReport.behaviors).map(b => b.kind)).toEqual(['price_action', 'emotional', 'risk_concentration', 'position_sizing'])
  })
})

describe('consequence', () => {
  it('counts gains out of the decisions with a result, not out of all of them', () => {
    const { group, baseline } = consequence(priceAction)
    expect(group).toEqual({ label: 'These 5 decisions', noun: 'decision', known: { pnl: 1240, avgReturn: 0.084, avgPnl: 248, detail: '4 of 5 gained' } })
    expect(baseline).toEqual({
      label: 'Your other 6 decisions', noun: 'decision', known: { pnl: 2210, avgReturn: 0.121, avgPnl: 442, detail: '4 of 5 gained, 1 not known yet' },
    })
  })

  it('shows a group without outcomes as unknown, even with gains or P/L present', () => {
    expect(consequence(anxious).group).toEqual({ label: 'These 4 decisions', noun: 'decision', known: null })
    expect(consequence(behavior('fomo', null, { decisions: 3, gains: 0, pnl: 0, avg_return: 0 })).group?.known).toBeNull()
    expect(consequence(behavior('fomo', null, { decisions: 3, outcomes: 0, gains: 0, pnl: 0, avg_return: 0 })).group?.known).toBeNull()
  })

  it('names holdings and closed positions for the kinds made of them, and has no baseline without its figures', () => {
    expect(consequence(concentration)).toEqual({
      group: { label: 'These 2 holdings', noun: 'holding', known: { pnl: 3100, avgReturn: 0.22, avgPnl: 1550, detail: '2 of 2 gained' } }, baseline: null,
    })
    expect(consequence(behavior('loss_aversion', null, { decisions: 1 })).group?.label).toBe('This closed position')
  })
})

describe('kind figures', () => {
  it('words size and possible loss, and compares with the rest of the user’s buys', () => {
    expect(kindFacts(sizing)).toEqual([
      'Average size: 24% of the portfolio, against 7% for your other buys',
      '2 written with low or no stated conviction',
      'In a bad month (about 1 in 20), this could be about −$950',
    ])
    expect(kindFacts(concentration)).toEqual([
      'Largest of these: 31% of the portfolio',
      'Their sector: 58% of the portfolio',
      'In a bad month (about 1 in 20), this could be about −$1,840',
    ])
  })

  it('reads median days by kind and skips keys it does not know', () => {
    expect(kindFacts(behavior('loss_aversion', null, { median_days: 40, baseline_median_days: 12, open_losses_held_longer: 1 }))).toEqual([
      'Losses were held 40 days at the median, against 12 days for gains',
      '1 open loss is already held longer than a typical gain',
    ])
    expect(kindFacts(behavior('short_term', null, { median_days: 1, mystery: 3 }))).toEqual(['Sold after 1 day at the median'])
    expect(kindFacts(behavior('run_up', null, { median_run_up: 0.153, baseline_median_run_up: -0.02 }))).toEqual([
      'Typical rise in the five weeks before buying: +15.3%, against −2.0% for your other buys',
    ])
  })
})

it('says what changed since the last report holding the same behavior', () => {
  expect(sinceLast(priceAction)).toBe('Since your report on Oct 27: 1 new decision, average return from +6.1% to +8.4%')
  expect(sinceLast(behavior('fomo', null, { decisions: 3 }, { previous: { day: '2026-10-20', figures: [{ key: 'decisions', value: 3, unit: 'count' }] } })))
    .toBe('Since your report on Oct 20: no new decisions')
  expect(sinceLast(anxious)).toBeNull()
})

it('explains why Generate isn’t offered', () => {
  const latest = { day: '2026-10-27', generatedAt: '', behaviors: [] }
  expect(blockedReason('UPDATED_TODAY', latest)).toBe('Updated today')
  expect(blockedReason('NOTHING_NEW', latest)).toBe('Nothing new since Oct 27')
  expect(blockedReason('FAILED_TODAY', latest)).toBeNull()
  expect(blockedReason(null, undefined)).toBeNull()
})

it('hints at what a behavior still forming waits for, never at trading', () => {
  expect(needHint(demoReport.needs[0])).toEqual({ name: 'Buying without an exit plan', hint: 'Write about 2 more trades' })
  expect(needHint(demoReport.needs[1])).toEqual({ name: 'Holding losses longer than gains', hint: 'Appears after 1 more closed position' })
  expect(needHint({ kind: 'run_up', subject: null, more: 3, reason: 'PRICES' })?.hint).toBe('Waiting on price history')
  expect(needHint(demoReport.needs[2])).toBeNull()
  expect(needHint({ kind: 'fomo', subject: null, more: 0, reason: 'TRADES' })).toBeNull()
})

it('moves between cards with the arrow keys and closes on Escape', () => {
  expect(paneKey('ArrowRight', 0, 4)).toEqual({ move: 1 })
  expect(paneKey('ArrowRight', 3, 4)).toBeNull()
  expect(paneKey('ArrowLeft', 2, 4)).toEqual({ move: 1 })
  expect(paneKey('ArrowLeft', 0, 4)).toBeNull()
  expect(paneKey('Escape', 1, 4)).toBe('close')
  expect(paneKey('Enter', 1, 4)).toBeNull()
})

it('uses no "·" separator in any worded string', () => {
  const every = ['no_plan', 'undocumented', 'emotional', 'fomo', 'hype', 'run_up', 'overtrading', 'overconfidence',
    'price_action', 'loss_aversion', 'short_term', 'risk_concentration', 'position_sizing']
  expect(every.every(isKnownKind)).toBe(true)
  const values = Object.fromEntries(['decisions', 'outcomes', 'pnl', 'avg_return', 'gains', 'median_run_up', 'from_news_or_social',
    'burst_weeks', 'round_trips', 'median_trades_per_week', 'right_for_wrong_reason', 'median_days', 'open_losses_held_longer',
    'avg_weight', 'large_low_conviction', 'largest_weight', 'sector_weight', 'possible_monthly_loss']
    .flatMap(key => [[key, 2], [`baseline_${key}`, 1]]))
  const strings = every.flatMap(kind => {
    const b = behavior(kind, kind === 'emotional' ? 'anxious' : null, values, { previous: { day: '2026-10-01', figures: [] } })
    const { group, baseline } = consequence(b)
    return [behaviorTitle(b), behaviorName(b), ...kindFacts(b), sinceLast(b) ?? '', group?.label ?? '', group?.known?.detail ?? '',
      baseline?.label ?? '', ...['ENTRIES', 'TRADES', 'PRICES', 'FIELDS'].map(reason => needHint({ kind, subject: null, more: 2, reason })?.hint ?? '')]
  })
  strings.push(reportDayLong('2026-10-27'), blockedReason('NOTHING_NEW', { day: '2026-10-27', generatedAt: '', behaviors: [] }) ?? '')
  expect(strings.filter(Boolean).length).toBeGreaterThan(100)
  expect(strings.filter(s => s.includes('·'))).toEqual([])
})

describe('evidence timeline', () => {
  const entry = (id: number, timestamp: string): JournalEntry => ({
    id, timestamp, entryType: 'INSIGHT', body: '', ticker: null, priceSnapshot: null, tags: [],
  })
  const cites = (kind: string, ...entryIds: number[]): Behavior =>
    behavior(kind, null, {}, { citations: entryIds.map(entryId => ({ entryId, quote: '', entryExists: true })) })
  const report = (asOf: string, behaviors: Behavior[]) => ({ asOf, behaviors })

  it('spans the months from the report’s earliest quote to its day, the same for every card', () => {
    const entries = [entry(1, '2026-08-10T15:00:00Z'), entry(2, '2026-10-02T15:00:00Z')]
    const both = report('2026-10-29', [cites('price_action', 2), cites('fomo', 1)])
    const first = evidenceTimeline(entries, both, both.behaviors[0])
    expect(first.months.map(m => m.label)).toEqual(['Aug', 'Sep', 'Oct'])
    expect(evidenceTimeline(entries, both, both.behaviors[1]).months).toEqual(first.months)
  })

  it('marks only the days this behavior quoted, where each falls within its month', () => {
    const entries = [entry(1, '2026-09-01T15:00:00Z'), entry(2, '2026-10-16T15:00:00Z'), entry(3, '2026-10-16T18:00:00Z'), entry(4, '2026-09-20T15:00:00Z')]
    const both = report('2026-10-29', [cites('price_action', 1, 2, 3), cites('fomo', 4)])
    const { marks } = evidenceTimeline(entries, both, both.behaviors[0])
    expect(marks.map(m => [m.date, m.entryIds])).toEqual([['2026-09-01', [1]], ['2026-10-16', [2, 3]]])
    // Sep 1 sits at the start of the first of two months; Oct 16 halfway through the second
    expect(marks[0].position).toBeCloseTo(0.5 / 30 / 2)
    expect(marks[1].position).toBeCloseTo((1 + 15.5 / 31) / 2)
    expect(marks[1].label).toBe('Oct 16, 2026: 2 entries quoted')
  })

  it('places a late-evening entry on its New York day', () => {
    const entries = [entry(1, '2026-10-01T02:30:00Z')] // 22:30 on Sep 30 in New York
    const one = report('2026-10-29', [cites('price_action', 1)])
    expect(evidenceTimeline(entries, one, one.behaviors[0]).marks[0].date).toBe('2026-09-30')
  })

  it('leaves out deleted entries, entries it does not have and kinds the page skips', () => {
    const entries = [entry(1, '2026-06-10T15:00:00Z'), entry(2, '2026-10-10T15:00:00Z')]
    const skipped = cites('news_drift', 1)
    const deleted = behavior('price_action', null, {}, { citations: [
      { entryId: 2, quote: '', entryExists: false }, { entryId: 99, quote: '', entryExists: true }] })
    const timeline = evidenceTimeline(entries, report('2026-10-29', [skipped, deleted]), deleted)
    expect(timeline.marks).toEqual([])
    expect(timeline.months.map(m => m.label)).toEqual(['Oct'])
  })

  it('stretches the months to the earliest trade on any card, so a chart and its strip share them', () => {
    const entries = [entry(1, '2026-10-02T15:00:00Z')]
    const traded = behavior('fomo', null, {}, { trades: [
      { tradeId: 1, tradeExists: true, ticker: 'AAA', side: 'BUY', shares: 1, price: 1, timestamp: '2026-08-20T15:00:00Z' },
      { tradeId: 2, tradeExists: false, ticker: null, side: null, shares: null, price: null, timestamp: null }] })
    const both = report('2026-10-29', [cites('price_action', 1), traded])
    expect(evidenceTimeline(entries, both, both.behaviors[0]).months.map(m => m.label)).toEqual(['Aug', 'Sep', 'Oct'])
  })

  it('shows the year where a span crosses one', () => {
    const entries = [entry(1, '2025-11-10T15:00:00Z')]
    const one = report('2026-01-15', [cites('price_action', 1)])
    expect(evidenceTimeline(entries, one, one.behaviors[0]).months.map(m => m.label)).toEqual(['Nov 2025', 'Dec', 'Jan 2026'])
  })
})
