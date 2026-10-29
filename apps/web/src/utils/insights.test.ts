import { describe, expect, it } from 'vitest'
import type { InsightPattern } from '../types/insights'
import { journalUpTo, kindLabel, needHint, patternContext, patternMeasures, patternTitle } from './insights'

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
