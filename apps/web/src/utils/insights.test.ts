import { describe, expect, it } from 'vitest'
import type { InsightPattern, InsightReport } from '../types/insights'
import type { JournalEntry } from '../types/journal'
import { journalHistory, journalUpTo, kindLabel, needHint, patternContext, patternMeasures, patternTitle } from './insights'

const pattern = (kind: string, subject: string | null, figures: Record<string, number>): InsightPattern => ({
  kind, subject, observation: '', question: '', citations: [],
  figures: Object.entries(figures).map(([key, value]) => ({ key, value, unit: key.endsWith('days') ? 'days' : 'count' })),
})

describe('pattern titles', () => {
  it('names each kind and subject in fixed words', () => {
    expect(patternTitle(pattern('felt_vs_did', 'anxious', {}))).toBe('After feeling anxious')
    expect(patternTitle(pattern('outcomes_by_state', 'emotion:fomo', {}))).toBe('Outcomes when you felt FOMO')
    expect(patternTitle(pattern('outcomes_by_state', 'conviction:high', {}))).toBe('Outcomes with high conviction')
    expect(patternTitle(pattern('outcomes_by_state', 'idea_source:social_media', {}))).toBe('Outcomes of ideas from social media')
    expect(patternTitle(pattern('outcomes_by_state', 'mood:odd', {}))).toBe('Outcomes by state of mind')
    expect(patternTitle(pattern('gains_vs_losses', null, {}))).toBe('Holding period: gains vs. losses')
    expect(patternTitle(pattern('news_drift', null, {}))).toBe('')
  })
})

describe('pattern measures', () => {
  it('writes counts as "N of M" and days as days, never as percentages', () => {
    expect(patternMeasures(pattern('felt_vs_did', 'anxious', { entries: 4, followed_by_buy: 3, followed_by_sell: 1 }))).toEqual([
      { lead: '3', rest: 'of 4 entries followed by a buy' },
      { lead: '1', rest: 'of 4 entries followed by a sell' },
    ])
    expect(patternMeasures(pattern('gains_vs_losses', null, {
      gains: 6, losses: 1, gains_median_days: 40.4, losses_median_days: 1, gains_with_entry: 2, losses_with_entry: 1,
    }))).toEqual([
      { lead: '40 days', rest: 'median hold for gains' },
      { lead: '1 day', rest: 'median hold for losses' },
      { lead: '2', rest: 'of 6 gains with a note' },
      { lead: '1', rest: 'of 1 loss with a note' },
    ])
  })

  it('ignores figure keys it does not know and leaves out measures whose figures are missing', () => {
    expect(patternMeasures(pattern('silent_trades', null, { trades: 10, without_entry: 4, streak: 9 }))).toEqual([
      { lead: '4', rest: 'of 10 trades without a note' },
    ])
    expect(patternMeasures(pattern('open_theses', null, { not_revisited: 3 }))).toEqual([])
    expect(patternMeasures(pattern('silent_trades', null, { trades: 0, without_entry: 0 }))).toEqual([])
    expect(patternMeasures(pattern('news_drift', null, { entries: 2 }))).toEqual([])
  })

  it('labels a finding with its kind only when the title names a subject', () => {
    expect(kindLabel(pattern('felt_vs_did', 'anxious', {}))).toBe('Feelings and what followed')
    expect(kindLabel(pattern('silent_trades', null, {}))).toBeNull()
    expect(patternContext(pattern('horizon_vs_holding', 'months', {}))).toBe('Stated horizon: months')
    expect(patternContext(pattern('silent_trades', null, {}))).toBeNull()
  })
})

describe('needs', () => {
  it('says what is missing, without nudging toward a trade', () => {
    expect(needHint({ kind: 'felt_vs_did', more: 1 })).toEqual({ name: 'Feelings and what followed', hint: 'Name a feeling in 1 more entry' })
    expect(needHint({ kind: 'silent_trades', more: 2 })?.hint).toBe('Appears after 2 more trades')
    expect(needHint({ kind: 'gains_vs_losses', more: 3 })?.hint).toBe('Appears after 3 more closed positions')
    expect(needHint({ kind: 'news_drift', more: 2 })).toBeNull()
  })
})

it('dates the report in New York time', () => {
  expect(journalUpTo('2026-10-27T02:00:00Z')).toBe('Oct 26, 2026')
  expect(journalUpTo(null)).toBeNull()
})

describe('journal history', () => {
  const entry = (id: number, timestamp: string): JournalEntry => ({
    id, timestamp, entryType: 'INSIGHT', body: '', ticker: null, priceSnapshot: null, tags: [],
  })
  const cites = (kind: string, ...entryIds: number[]): InsightPattern => ({
    ...pattern(kind, null, {}), citations: entryIds.map(entryId => ({ entryId, quote: '', entryExists: true })),
  })
  const report = (entriesUpTo: string | null, patterns: InsightPattern[] = []): InsightReport => ({
    generatedOn: '2026-10-28', asOf: '2026-10-28', entriesUpTo, saved: true, patterns, needs: [],
  })
  const days = (history: ReturnType<typeof journalHistory>) => history?.weeks.flat() ?? []
  const day = (history: ReturnType<typeof journalHistory>, date: string) => days(history).find(d => d.date === date)

  it('counts entries by New York day, including a late evening one that is the next day in UTC', () => {
    const history = journalHistory([
      entry(1, '2026-10-12T14:00:00Z'),
      entry(2, '2026-10-13T02:30:00Z'), // 22:30 on Oct 12 in New York
      entry(3, '2026-10-13T15:00:00Z'),
    ], report('2026-10-14T12:00:00Z'))
    expect(day(history, '2026-10-12')).toMatchObject({ entries: 2, inSpan: true })
    expect(day(history, '2026-10-13')).toMatchObject({ entries: 1 })
    expect(day(history, '2026-10-11')).toMatchObject({ entries: 0, inSpan: true })
  })

  it('spans from the Sunday of the first entry’s week to the report’s week', () => {
    // Wed Sep 30 to Wed Oct 14, 2026
    const history = journalHistory([entry(1, '2026-10-14T12:00:00Z'), entry(2, '2026-09-30T12:00:00Z')], report('2026-10-14T12:00:00Z'))
    expect(history?.weeks).toHaveLength(3)
    expect(history?.weeks.every(week => week.length === 7)).toBe(true)
    expect(history?.weeks[0][0].date).toBe('2026-09-27')
    expect(history?.weeks[2].map(d => d.date)).toEqual(
      ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'])
    expect(history?.weeks[2].map(d => d.inSpan)).toEqual([true, true, true, true, false, false, false])
  })

  it('leaves out entries written after the report', () => {
    const history = journalHistory([entry(1, '2026-10-12T12:00:00Z'), entry(2, '2026-10-20T12:00:00Z')], report('2026-10-12T12:00:00Z'))
    expect(history?.weeks).toHaveLength(1)
    expect(days(history).reduce((sum, d) => sum + d.entries, 0)).toBe(1)
  })

  it('draws only the newest 1000 entries the report could read', () => {
    const entries = Array.from({ length: 1001 }, (_, i) => entry(i + 1, new Date(Date.UTC(2024, 0, 1, 12) + i * 86_400_000).toISOString()))
    const history = journalHistory(entries, report(entries[1000].timestamp, [cites('felt_vs_did', 1)]))
    expect(days(history).reduce((sum, d) => sum + d.entries, 0)).toBe(1000)
    // Jan 1, 2024 is still drawn, in the week of the oldest entry read, but empty and not quoted
    expect(day(history, '2024-01-01')).toMatchObject({ entries: 0, findings: [] })
    expect(day(history, '2024-01-02')).toMatchObject({ entries: 1 })
  })

  it('marks a quoted day with the numbers of the findings that quote it, in order', () => {
    const history = journalHistory([entry(1, '2026-10-12T14:00:00Z'), entry(2, '2026-10-12T18:00:00Z'), entry(3, '2026-10-13T14:00:00Z')],
      report('2026-10-13T14:00:00Z', [cites('felt_vs_did', 3, 1), cites('silent_trades'), cites('gains_vs_losses', 2, 1)]))
    expect(day(history, '2026-10-12')).toMatchObject({ entries: 2, quoted: 2, findings: [1, 3] })
    expect(day(history, '2026-10-13')).toMatchObject({ entries: 1, quoted: 1, findings: [1] })
  })

  it('ignores citations of entries it does not have and from kinds the page skips', () => {
    const history = journalHistory([entry(1, '2026-10-12T14:00:00Z'), entry(2, '2026-10-20T14:00:00Z')],
      report('2026-10-12T14:00:00Z', [cites('news_drift', 1), cites('felt_vs_did', 99, 2), cites('silent_trades', 1)]))
    expect(day(history, '2026-10-12')).toMatchObject({ entries: 1, quoted: 1, findings: [2] })
    expect(days(history).filter(d => d.findings.length)).toHaveLength(1)
  })

  it('labels each month above the first week its first day appears in', () => {
    // Thu Aug 20 to Thu Oct 15, 2026; Sep 1 is a Tuesday and Oct 1 a Thursday
    const history = journalHistory([entry(1, '2026-08-20T12:00:00Z')], report('2026-10-15T12:00:00Z'))
    expect(history?.weeks[0][0].date).toBe('2026-08-16')
    expect(history?.months).toEqual([{ label: 'Sep', column: 2 }, { label: 'Oct', column: 6 }])
  })

  it('has no history without a report date or without entries it read', () => {
    expect(journalHistory([entry(1, '2026-10-12T12:00:00Z')], report(null))).toBeNull()
    expect(journalHistory([], report('2026-10-12T12:00:00Z'))).toBeNull()
    expect(journalHistory([entry(1, '2026-10-20T12:00:00Z')], report('2026-10-12T12:00:00Z'))).toBeNull()
  })
})
