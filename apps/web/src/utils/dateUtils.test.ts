import { describe, it, expect } from 'vitest'
import { getNextMarketUpdate, formatNextUpdate } from './dateUtils'

const nyDate = (iso: string) => new Date(iso)

describe('getNextMarketUpdate', () => {
  it('returns the next top-of-hour during trading hours', () => {
    // Wednesday 11:15 AM ET = 15:15 UTC during EDT
    const now = nyDate('2026-06-10T15:15:00Z')
    const next = getNextMarketUpdate(now)

    expect(next.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false })).toBe('6/10/2026, 12:00:00')
  })

  it('returns 4:30 PM during the EOD buffer window', () => {
    // Wednesday 4:15 PM ET = 20:15 UTC
    const now = nyDate('2026-06-10T20:15:00Z')
    const next = getNextMarketUpdate(now)

    expect(next.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false })).toBe('6/10/2026, 16:30:00')
  })

  it('rolls after-hours to the next weekday 10 AM', () => {
    // Wednesday 5:00 PM ET
    const now = nyDate('2026-06-10T21:00:00Z')
    const next = getNextMarketUpdate(now)

    expect(next.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false })).toBe('6/11/2026, 10:00:00')
  })

  it('rolls Saturday to Monday 10 AM', () => {
    // Saturday 11:00 AM ET
    const now = nyDate('2026-06-13T15:00:00Z')
    const next = getNextMarketUpdate(now)

    expect(next.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false })).toBe('6/15/2026, 10:00:00')
  })

  it('rolls Sunday to Monday 10 AM', () => {
    // Sunday 2:00 PM ET
    const now = nyDate('2026-06-14T18:00:00Z')
    const next = getNextMarketUpdate(now)

    expect(next.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false })).toBe('6/15/2026, 10:00:00')
  })

  it('rolls Friday after-hours to Monday 10 AM', () => {
    // Friday 6:00 PM ET
    const now = nyDate('2026-06-12T22:00:00Z')
    const next = getNextMarketUpdate(now)

    expect(next.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false })).toBe('6/15/2026, 10:00:00')
  })

  it('returns the EOD fetch at exactly 4:00 PM', () => {
    // Wednesday 4:00 PM ET exactly — the 16:00 intraday fetch just ran
    const now = nyDate('2026-06-10T20:00:00Z')
    const next = getNextMarketUpdate(now)

    expect(next.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false })).toBe('6/10/2026, 16:30:00')
  })

  it('handles pre-market as today 10 AM', () => {
    // Wednesday 8:00 AM ET
    const now = nyDate('2026-06-10T12:00:00Z')
    const next = getNextMarketUpdate(now)

    expect(next.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false })).toBe('6/10/2026, 10:00:00')
  })
})

describe('formatNextUpdate', () => {
  it('formats within one hour as "in Xm"', () => {
    const now = nyDate('2026-06-10T15:15:00Z')
    const next = nyDate('2026-06-10T16:05:00Z')

    expect(formatNextUpdate(next, now)).toBe('in 50m')
  })

  it('formats more than one hour as "Tomorrow ..." when tomorrow', () => {
    const now = nyDate('2026-06-10T21:00:00Z')
    const next = nyDate('2026-06-11T14:00:00Z')

    expect(formatNextUpdate(next, now)).toBe('Tomorrow 10 AM')
  })

  it('detects tomorrow across month boundaries', () => {
    // Tuesday March 31 5:00 PM ET -> next is Wednesday April 1 10:00 AM ET
    const now = nyDate('2026-03-31T21:00:00Z')
    const next = nyDate('2026-04-01T14:00:00Z')

    expect(formatNextUpdate(next, now)).toBe('Tomorrow 10 AM')
  })

  it('formats more than one hour as weekday label when not tomorrow', () => {
    const now = nyDate('2026-06-12T22:00:00Z') // Friday after hours
    const next = nyDate('2026-06-15T14:00:00Z') // Monday 10 AM

    expect(formatNextUpdate(next, now)).toBe('Mon 10 AM')
  })
})
