import { describe, expect, it } from 'vitest'
import { matchesJournalFilters } from '../../utils/journalFilters'
import { AAPL_SELL, BEHAVIOR, JOURNAL_ENTRIES, JOURNAL_SCRIPT, NVDA_INSIGHT, SPY_BUY } from './landingStory'

describe('landing journal script', () => {
  it('narrows the journal at each applied step and ends on the hero entries', () => {
    const applied = JOURNAL_SCRIPT.filter((step, index) => index === 0 || step.applied !== JOURNAL_SCRIPT[index - 1].applied)
    const results = applied.map(step => JOURNAL_ENTRIES.filter(entry => matchesJournalFilters(entry, step.applied)))

    expect(results.map(entries => entries.length)).toEqual([13, 10, 5, 3])
    // Filtering only removes entries, so the list never re-adds a card.
    results.slice(1).forEach((entries, i) => expect(entries.every(entry => results[i].includes(entry))).toBe(true))
    expect(results[results.length - 1]).toEqual([SPY_BUY, NVDA_INSIGHT, AAPL_SELL])
  })
})

describe('landing behavior report', () => {
  it('quotes its entries word for word and keeps numbers out of the AI text, as Insights does', () => {
    for (const { entryId, quote } of BEHAVIOR.citations) {
      expect(JOURNAL_ENTRIES.find(entry => entry.id === entryId)?.body).toContain(quote)
    }
    expect(`${BEHAVIOR.observation} ${BEHAVIOR.question}`).not.toMatch(/\d/)
  })
})
