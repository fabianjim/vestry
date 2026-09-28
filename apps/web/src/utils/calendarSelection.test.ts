import { describe, expect, it } from 'vitest'
import { dateRange, dateSelectionFilters, filterDateKey, marketDateKey, marketDayBoundary, selectDates, selectedDates } from './calendarSelection'

describe('calendar selection', () => {
  it('selects inclusive ranges in either direction across months and leap days', () => {
    expect(dateRange('2028-03-01', '2028-02-28')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01'])
    expect(dateRange('2028-02-30', '2028-03-01')).toEqual([])
  })

  it('replaces plain selections, toggles additive clicks, and unions additive ranges', () => {
    const base = ['2026-09-01', '2026-09-03']
    expect(selectDates(base, '2026-09-01', '2026-09-05', false, false)).toEqual(['2026-09-05'])
    expect(selectDates(base, '2026-09-01', '2026-09-03', true, false)).toEqual(['2026-09-01'])
    expect(selectDates(base, '2026-09-03', '2026-09-05', true, true)).toEqual(['2026-09-01', '2026-09-03', '2026-09-04', '2026-09-05'])
    expect(selectDates(base, '2026-09-01', '2026-09-03', false, true)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])
  })

  it('round trips continuous and disjoint selections without including gaps', () => {
    for (const dates of [[], ['2026-09-01'], ['2026-09-01', '2026-09-02'], ['2026-09-01', '2026-09-03']]) {
      expect(selectedDates(dateSelectionFilters(dates))).toEqual(dates)
    }
    expect(dateSelectionFilters(['2026-09-03', '2026-09-01'])).toEqual({ dates: ['2026-09-01', '2026-09-03'], from: undefined, to: undefined })
    expect(selectedDates({ from: '2026-09-03', to: '2026-09-01' })).toEqual([])
  })

  it.each([
    ['2026-03-08', '2026-03-08T05:00:00.000Z', '2026-03-09T03:59:59.999Z'],
    ['2026-11-01', '2026-11-01T04:00:00.000Z', '2026-11-02T04:59:59.999Z'],
    ['2026-12-31', '2026-12-31T05:00:00.000Z', '2027-01-01T04:59:59.999Z'],
  ])('uses full New York day boundaries for %s', (day, start, end) => {
    expect(marketDayBoundary(day)).toBe(start)
    expect(marketDayBoundary(day, true)).toBe(end)
    expect(marketDateKey(new Date(start))).toBe(day)
    expect(filterDateKey(start)).toBe(day)
  })
})
