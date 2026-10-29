import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '../services/queryClient'
import type { InsightReport, InsightsState } from '../types/insights'
import type { JournalEntry } from '../types/journal'
import { InsightsView } from './Insights'

const report: InsightReport = {
  generatedOn: '2026-10-26', asOf: '2026-10-26', entriesUpTo: '2026-10-26T14:03:00Z', saved: true,
  patterns: [
    {
      kind: 'felt_vs_did', subject: 'anxious',
      figures: [{ key: 'entries', value: 4, unit: 'count' }, { key: 'followed_by_buy', value: 3, unit: 'count' }],
      observation: 'You often bought soon after writing that you felt anxious.',
      question: 'What did buying settle for you?',
      citations: [
        { entryId: 12, quote: "I'm nervous about this", entryExists: true },
        { entryId: 13, quote: 'private words the user deleted', entryExists: false },
      ],
    },
    { kind: 'news_drift', subject: null, figures: [], observation: 'Unknown kind', question: 'q', citations: [] },
  ],
  needs: [{ kind: 'silent_trades', more: 2 }, { kind: 'news_drift', more: 1 }],
}
const entry = (id: number, timestamp: string): JournalEntry => ({
  id, timestamp, entryType: 'INSIGHT', body: '', ticker: null, priceSnapshot: null, tags: [],
})
const entries = [entry(12, '2026-10-12T14:00:00Z'), entry(14, '2026-10-20T14:00:00Z'), entry(15, '2026-10-20T16:00:00Z')]
const noop = () => {}
type Options = Partial<{ loading: boolean; entries: JournalEntry[]; entriesLoading: boolean; isDemo: boolean; refreshing: boolean; refreshError: string }>
const render = (state: InsightsState | undefined, options: Options = {}) =>
  renderToString(
    <QueryClientProvider client={createQueryClient()}>
      <InsightsView state={state} loading={options.loading ?? false} entries={'entries' in options ? options.entries : entries}
        entriesLoading={options.entriesLoading ?? false} isDemo={options.isDemo ?? false}
        refreshing={options.refreshing ?? false} refreshError={options.refreshError ?? null} onRefresh={noop} onOpenEntry={noop} />
    </QueryClientProvider>,
  )

describe('Insights page states', () => {
  it('shows the report with fixed titles, worded figures and quotes', () => {
    const html = render({ report, canRefresh: true, unavailable: false })
    expect(html).toContain('Your journal up to Oct 26, 2026')
    expect(html).toContain('After feeling anxious')
    expect(html).toMatch(/>3<\/span><span[^>]*>of 4 entries followed by a buy</)
    expect(html).toContain('I&#x27;m nervous about this')
    expect(html).toContain('A question to consider')
    expect(html).toContain('Write an insight')
    expect(html).toContain('>Refresh<')
    expect(html).toContain('Still forming')
    expect(html).toContain('Where do the numbers come from?')
    expect(html).toContain('Appears after 2 more trades')
  })

  it('skips kinds it does not know and never repeats a deleted entry’s words', () => {
    const html = render({ report, canRefresh: true, unavailable: false })
    expect(html).not.toContain('Unknown kind')
    expect(html).toContain('Entry deleted')
    expect(html).not.toContain('private words the user deleted')
    expect(html).not.toContain('·')
  })

  it('offers a first build, then disables refresh for the rest of the day', () => {
    const first = render({ report: null, canRefresh: true, unavailable: false })
    expect(first).toContain('Build your Insights')
    expect(first).toContain('Theses not revisited')
    const today = render({ report, canRefresh: false, unavailable: false })
    expect(today).toMatch(/<button[^>]*disabled[^>]*>Refreshed today</)
  })

  it('says calmly what is happening while building, when unavailable and when there is too little history', () => {
    const building = render({ report, canRefresh: true, unavailable: false }, { refreshing: true })
    expect(building).toContain('Building your Insights. This can take a little while.')
    expect(building).toMatch(/<button[^>]*disabled[^>]*>Building…</)
    const down = render({ report: null, canRefresh: false, unavailable: true })
    expect(down).toContain("Insights can&#x27;t be reached right now")
    expect(down).not.toContain('Build your Insights')
    const empty = render({ report: { ...report, saved: false, patterns: [] }, canRefresh: true, unavailable: false })
    expect(empty).toContain('Not enough history yet')
    expect(empty).toContain('Trades without a note')
    expect(empty).not.toContain('aria-label="Still forming"')
    expect(render(undefined, { loading: true })).toContain('Loading Insights…')
    expect(render({ report, canRefresh: true, unavailable: false }, { refreshError: "Couldn't refresh Insights right now" }))
      .toContain('role="alert"')
  })

  it('shows demo visitors the prepared report without a refresh button', () => {
    const html = render({ report, canRefresh: false, unavailable: false }, { isDemo: true })
    expect(html).toContain('Prepared for the demo')
    expect(html).not.toContain('Refreshed today')
    expect(html).not.toContain('>Refresh<')
    expect(render({ report: null, canRefresh: false, unavailable: false }, { isDemo: true })).toContain('being prepared')
  })

  it('shows the journal the report read beside the findings, with quoted days explained', () => {
    const html = render({ report, canRefresh: true, unavailable: false })
    const history = html.indexOf('aria-label="Your journal in this report"')
    expect(history).toBeGreaterThan(html.indexOf('<aside'))
    expect(history).toBeLessThan(html.indexOf('</aside>'))
    expect(html).toMatch(/<button[^>]*aria-label="Oct 12, 2026: 1 entry, 1 quoted in 01"/)
    expect(html).toContain('aria-label="Oct 20, 2026: 2 entries"')
  })

  it('leaves the history out without a report or entries, and holds its space while entries load', () => {
    expect(render({ report: null, canRefresh: true, unavailable: false })).not.toContain('Your journal in this report')
    expect(render({ report, canRefresh: true, unavailable: false }, { entries: [] })).not.toContain('Your journal in this report')
    const loading = render({ report, canRefresh: true, unavailable: false }, { entries: undefined, entriesLoading: true })
    expect(loading).not.toContain('Your journal in this report')
    expect(loading).toMatch(/<div aria-hidden="true"[^>]*><div class="h-\[148px\]"><\/div><\/div>/)
  })
})
