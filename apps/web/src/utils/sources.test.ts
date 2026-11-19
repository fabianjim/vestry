import { expect, it } from 'vitest'
import { faviconUrl, formatSourceDate, sourceHost, sourceHref, sourceName } from './sources'

it('names a source by publisher, then domain, then title, and never links an unsafe URL', () => {
  expect(sourceHost('https://www.reuters.com/a')).toBe('reuters.com')
  expect(sourceName({ title: 'Annual report', url: 'https://www.reuters.com/a', publisher: 'Reuters' })).toBe('Reuters')
  expect(sourceName({ title: 'Annual report', url: 'https://www.reuters.com/a' })).toBe('reuters.com')
  expect(sourceName({ title: 'Annual report' })).toBe('Annual report')
  for (const url of ['javascript:alert(1)', 'not a url', null]) {
    expect(sourceHref({ title: 'x', url })).toBeNull()
    expect(faviconUrl({ title: 'x', url })).toBeNull()
  }
})

it('shows a source date as mm/dd', () => {
  expect(formatSourceDate('2026-11-03')).toBe('11/03')
  expect(formatSourceDate('Nov 3')).toBeNull()
})
