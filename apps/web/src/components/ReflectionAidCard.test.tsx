import { expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import ReflectionAidCard from './ReflectionAidCard'
import type { JournalEntry } from '../types/journal'
import type { ReflectionAidResult } from '../types/reflectionAid'

const now = new Date('2026-10-25T16:00:00Z')
const entry = {
  id: 7, entryType: 'BUY', body: 'buying the dip', ticker: 'NVDA',
  timestamp: '2026-03-03T15:30:00Z', priceSnapshot: 118, tags: [],
} as unknown as JournalEntry
const later = { ...entry, id: 52, entryType: 'INSIGHT', body: 'the dip was overdone' } as JournalEntry
const result: ReflectionAidResult = {
  aid: {
    recap: [{ summary: 'You later called the dip overdone', citations: [{ entryId: 52, quote: 'the dip was overdone' }] }],
    questions: ['What made this look like a dip?', '<script>untrusted</script>'],
  },
  generatedOn: '2026-10-25',
  remainingToday: 9,
  since: { priceNow: 142.3, sharesNow: 15, trades: [{ day: '2026-03-04', type: 'BUY', shares: 5, price: 131.2 }] },
}
const noop = () => {}
const render = (r: ReflectionAidResult, e: JournalEntry = entry, known: JournalEntry[] = [entry, later]) =>
  renderToString(<ReflectionAidCard entry={e} result={r} knownEntries={known} onEntryClick={noop} now={now} />)

it('shows vestry numbers, the quoted recap and the questions as plain text', () => {
  const html = render(result)
  expect(html).toContain('7 months')
  expect(html).toContain('$118.00')
  expect(html).toContain('$142.30')
  expect(html).toContain('20.6%')
  expect(html).toContain('Shares held now')
  expect(html).toContain('You later called the dip overdone')
  expect(html).toContain('the dip was overdone')
  expect(html).toContain('Questions to consider')
  expect(html).toContain('What made this look like a dip?')
  expect(html).toContain('&lt;script&gt;untrusted&lt;/script&gt;')
  expect(html).not.toContain('<script>')
  expect(html).toContain('9 AI reflections left today')
})

it('drops the labels the user asked to remove', () => {
  const html = render(result)
  expect(html).not.toContain('·')
  expect(html).not.toContain('Summarized by AI')
  expect(html).not.toContain('AI-generated')
})

it('links a quote to its entry only when the panel has that entry', () => {
  expect(render(result)).toContain('<button')
  expect(render(result, entry, [entry])).not.toContain('<button')
})

it('omits price rows without a ticker and says when there is nothing to work with', () => {
  const note = { ...entry, ticker: null, priceSnapshot: null } as unknown as JournalEntry
  const html = render({ ...result, aid: { recap: [], questions: [] },
    since: { priceNow: null, sharesNow: null, trades: [] }, remainingToday: 1 }, note)
  expect(html).not.toContain('Price then and now')
  expect(html).not.toContain('Questions to consider')
  expect(html).toContain('much in this entry to reflect on yet')
  expect(html).toContain('1 AI reflection left today')
})

it('shows no daily count for demo visitors, who never spend', () => {
  const html = render({ ...result, remainingToday: null })
  expect(html).not.toContain('left today')
  expect(html).toContain('What made this look like a dip?')
})
