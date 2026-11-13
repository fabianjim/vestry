import { describe, expect, it } from 'vitest'
import { pickActiveSection } from './useActiveSection'

describe('pickActiveSection', () => {
  const line = 120

  it('keeps the first section current until any section passes the line', () => {
    expect(pickActiveSection([300, 900, 1500], line, false)).toBe(0)
  })

  it('picks the last section whose top has passed the line', () => {
    expect(pickActiveSection([-800, 100, 700], line, false)).toBe(1)
    expect(pickActiveSection([-1400, -600, 120], line, false)).toBe(2)
  })

  it('picks the last section at the bottom of the page, even if its top has not passed the line', () => {
    expect(pickActiveSection([-1400, -600, 400], line, true)).toBe(2)
  })

  it('returns -1 when there are no sections', () => {
    expect(pickActiveSection([], line, false)).toBe(-1)
  })
})
