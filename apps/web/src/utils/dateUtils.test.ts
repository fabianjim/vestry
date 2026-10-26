import { describe, it, expect } from 'vitest'
import { formatElapsed, formatNextUpdate, isInMarketDateRange } from './dateUtils'

const nyDate = (iso: string) => new Date(iso)

describe('isInMarketDateRange', () => {
  it('includes the August 12 sale when both selected dates are August 12', () => {
    expect(isInMarketDateRange('2026-08-12T14:37:00Z', '2026-08-12', '2026-08-12')).toBe(true)
  })

  it.each([
    ['2026-08-12', '2026-08-12T04:00:00Z', '2026-08-13T04:00:00Z'],
    ['2026-01-12', '2026-01-12T05:00:00Z', '2026-01-13T05:00:00Z'],
    ['2026-03-08', '2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z'],
    ['2026-11-01', '2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z'],
  ])('includes the entire New York day %s, excluding neighboring days', (day, start, nextDay) => {
    const beforeStart = new Date(new Date(start).getTime() - 1).toISOString()
    const end = new Date(new Date(nextDay).getTime() - 1).toISOString()
    expect(isInMarketDateRange(beforeStart, day, day)).toBe(false)
    expect(isInMarketDateRange(start, day, day)).toBe(true)
    expect(isInMarketDateRange(end, day, day)).toBe(true)
    expect(isInMarketDateRange(nextDay, day, day)).toBe(false)
  })

  it('supports open bounds and clearing the date filter', () => {
    const sale = '2026-08-12T14:37:00Z'
    expect(isInMarketDateRange(sale, '2026-08-12', '')).toBe(true)
    expect(isInMarketDateRange(sale, '2026-08-13', '')).toBe(false)
    expect(isInMarketDateRange(sale, '', '2026-08-12')).toBe(true)
    expect(isInMarketDateRange(sale, '', '2026-08-11')).toBe(false)
    expect(isInMarketDateRange(sale, '', '')).toBe(true)
  })

  it('handles multi-day ranges and rejects reversed ranges', () => {
    const sale = '2026-08-12T14:37:00Z'
    expect(isInMarketDateRange(sale, '2026-06-11', '2026-08-19')).toBe(true)
    expect(isInMarketDateRange(sale, '2026-08-19', '2026-06-11')).toBe(false)
  })
})

describe('formatNextUpdate', () => {
  it('displays the backend Labor Day schedule as Tuesday', () => {
    expect(formatNextUpdate(new Date('2026-09-08T14:00:00Z'), new Date('2026-09-04T21:00:00Z'))).toBe('Tue 10am')
    expect(formatNextUpdate(new Date('2026-09-08T14:00:00Z'), new Date('2026-09-07T16:00:00Z'))).toBe('Tue 10am')
  })

  it('formats within one hour as "in Xm"', () => {
    const now = nyDate('2026-06-10T15:15:00Z')
    const next = nyDate('2026-06-10T16:05:00Z')

    expect(formatNextUpdate(next, now)).toBe('in 50m')
  })

  it('uses an abbreviated weekday even for tomorrow', () => {
    const now = nyDate('2026-06-10T21:00:00Z')
    const next = nyDate('2026-06-11T14:00:00Z')

    expect(formatNextUpdate(next, now)).toBe('Thu 10am')
  })

  it('uses the scheduled weekday across month boundaries', () => {
    // Tuesday March 31 5:00 PM ET -> next is Wednesday April 1 10:00 AM ET
    const now = nyDate('2026-03-31T21:00:00Z')
    const next = nyDate('2026-04-01T14:00:00Z')

    expect(formatNextUpdate(next, now)).toBe('Wed 10am')
  })

  it('preserves minutes and lowercase pm for afternoon updates', () => {
    expect(formatNextUpdate(nyDate('2026-06-10T20:30:00Z'), nyDate('2026-06-10T18:00:00Z'))).toBe('Wed 4:30pm')
  })

  it('formats more than one hour as weekday label when not tomorrow', () => {
    const now = nyDate('2026-06-12T22:00:00Z') // Friday after hours
    const next = nyDate('2026-06-15T14:00:00Z') // Monday 10 AM

    expect(formatNextUpdate(next, now)).toBe('Mon 10am')
  })
})

describe('formatElapsed', () => {
  const now = new Date('2026-10-25T16:00:00Z')

  it.each([
    ['2026-10-25T15:00:00Z', '0 days'],
    ['2026-10-24T15:00:00Z', '1 day'],
    ['2026-09-01T15:00:00Z', '54 days'],
    ['2026-03-03T15:30:00Z', '7 months'],
    ['2024-01-05T15:00:00Z', '2 years'],
    ['2026-10-26T15:00:00Z', '0 days'],
  ])('describes the time since %s as %s', (from, expected) => {
    expect(formatElapsed(from, now)).toBe(expected)
  })
})
