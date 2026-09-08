import { describe, it, expect } from 'vitest'
import { formatNextUpdate } from './dateUtils'

const nyDate = (iso: string) => new Date(iso)

describe('formatNextUpdate', () => {
  it('displays the backend Labor Day schedule as Tuesday', () => {
    expect(formatNextUpdate(new Date('2026-09-08T14:00:00Z'), new Date('2026-09-04T21:00:00Z'))).toBe('Tue 10 AM')
    expect(formatNextUpdate(new Date('2026-09-08T14:00:00Z'), new Date('2026-09-07T16:00:00Z'))).toBe('Tomorrow 10 AM')
  })

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
