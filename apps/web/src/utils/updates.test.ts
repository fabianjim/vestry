import { describe, expect, it } from 'vitest'
import { formatUpdateDate, sortShipped } from './updates'
import { SHIPPED } from '../components/updates/updates'

describe('updates', () => {
  it('sorts shipped entries newest first without mutating the input', () => {
    const entries = [
      { date: '2026-09-28', title: 'a', body: '' },
      { date: '2026-10-31', title: 'b', body: '' },
      { date: '2026-10-01', title: 'c', body: '' },
    ]
    expect(sortShipped(entries).map(e => e.date)).toEqual(['2026-10-31', '2026-10-01', '2026-09-28'])
    expect(entries[0].date).toBe('2026-09-28')
  })

  it('formats a calendar day without shifting it by time zone', () => {
    expect(formatUpdateDate('2026-10-31')).toBe('October 31, 2026')
    expect(formatUpdateDate('2026-09-01')).toBe('September 1, 2026')
  })

  it('keeps shipped content valid and on or after 2026-09-01', () => {
    for (const { date } of SHIPPED) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(date >= '2026-09-01').toBe(true)
    }
  })
})
