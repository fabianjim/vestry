import { afterEach, describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { createQueryClient } from '../services/queryClient'
import { journalQueries, portfolioQueries, stockQueries } from '../services/queries'
import type { JournalEntry } from '../types/journal'
import JournalPanel from './JournalPanel'
import JournalPage from '../pages/Journal'
import JournalDetailPanel from './JournalDetailPanel'

const client = createQueryClient()
const render = (node: ReactNode) => renderToString(
  <QueryClientProvider client={client}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>,
)
const entry: JournalEntry = {
  id: 1, ticker: 'AAPL', entryType: 'INSIGHT', body: 'Remember the original thesis',
  timestamp: '2026-09-24T14:00:00Z', priceSnapshot: 100, tags: [],
}
afterEach(() => client.clear())

describe('journal cache consumers', () => {
  it('renders the same cached entries on Dashboard and Journal, even after a background failure', () => {
    client.setQueryData(journalQueries.entries().queryKey, [entry])
    expect(render(<JournalPanel />)).toContain(entry.body)
    expect(render(<JournalPage />)).toContain(entry.body)
    client.getQueryCache().find({ queryKey: journalQueries.entries().queryKey })!
      .setState({ status: 'error', error: new Error('Offline') })
    const html = render(<JournalPage />)
    expect(html).toContain(entry.body)
    expect(html).toContain('Offline')
  })

  it('uses a cached source quote when its entry is absent from the visible list', () => {
    client.setQueryData(journalQueries.entries().queryKey, [{ ...entry, id: 2, body: 'Reconsidering', entryType: 'REFLECTION', sourceEntryId: 1 }])
    client.setQueryData(journalQueries.entry(1).queryKey, entry)
    expect(render(<JournalPanel />)).toContain(entry.body)
    client.setQueryData(journalQueries.entry(1).queryKey, { ...entry, body: 'Updated thesis' })
    const html = render(<JournalPanel />)
    expect(html).toContain('Updated thesis')
    expect(html).not.toContain(entry.body)
  })

  it('preserves realized sale results when the latest stock quote is unavailable', () => {
    const buyTime = '2026-09-23T14:00:00Z'
    client.setQueryData(portfolioQueries.transactions().queryKey, [
      { id: 1, ticker: 'AAPL', shares: 2, price: 100, totalValue: 200, type: 'BUY', timestamp: buyTime },
      { id: 2, ticker: 'AAPL', shares: 1, price: 120, totalValue: 120, type: 'SELL', timestamp: entry.timestamp },
    ])
    client.setQueryData(stockQueries.history('AAPL', buyTime).queryKey, [])
    client.setQueryData(journalQueries.ticker('AAPL').queryKey, [])
    client.setQueryData(stockQueries.snapshot('AAPL').queryKey, { stock: null, stale: true, staleWarning: null, lastSuccessfulFetch: null, eod: false })
    client.getQueryCache().find({ queryKey: stockQueries.snapshot('AAPL').queryKey })!
      .setState({ status: 'error', error: new Error('Quote unavailable') })
    const html = render(<JournalDetailPanel entry={{ ...entry, entryType: 'SELL', priceSnapshot: 120 }}
      onClose={() => {}} onEntryClick={() => {}} onEntryCreated={() => {}} />)
    expect(html).toContain('Quote unavailable')
    expect(html).toContain('Realized gain/loss')
    expect(html).toContain('20.00')
  })
})
