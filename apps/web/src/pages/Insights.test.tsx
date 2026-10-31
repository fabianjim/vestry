import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '../services/queryClient'
import { insightsQueries } from '../services/queries'
import type { InsightsOverview } from '../types/insights'
import { demoReport, overview } from '../utils/insights.fixtures'
import BehaviorCard from '../components/insights/BehaviorCard'
import type { JournalEntry } from '../types/journal'
import { InsightsView, type Pane } from './Insights'

const noop = () => {}
type Options = Partial<{ unreachable: boolean; isDemo: boolean; demoGenerated: boolean; pane: Pane; generating: boolean; generateError: string; hasOlder: boolean }>

const render = (state: InsightsOverview | undefined, options: Options = {}) => {
  const client = createQueryClient()
  client.setQueryData(insightsQueries.behaviorReport(demoReport.day).queryKey, demoReport)
  return renderToString(
    <QueryClientProvider client={client}>
      <InsightsView overview={state} unreachable={options.unreachable ?? false} loading={false} isDemo={options.isDemo ?? false} demoGenerated={options.demoGenerated ?? false}
        pane={options.pane ?? null} generating={options.generating ?? false} generateError={options.generateError ?? null}
        reports={state?.reports ?? []} hasOlder={options.hasOlder ?? false} loadingOlder={false} olderError={false}
        entries={undefined}
        onGenerate={noop} onOpen={noop} onPaneIndex={noop} onClosePane={noop} onViewPast={noop} onShowOlder={noop} onOpenEntry={noop} />
    </QueryClientProvider>,
  )
}
const card = (index: number): Pane => ({ kind: 'report', day: demoReport.day, index })
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('Insights page states', () => {
  it('offers Generate before the first report', () => {
    const html = render(overview({ reports: [], canGenerate: true, blockedReason: null }))
    expect(html).toContain('>Generate report<')
    expect(html).toContain('No reports yet.')
    expect(html).not.toContain('Open latest report')
  })

  it('opens the latest report with a reason when Generate is gated', () => {
    expect(text(render(overview()))).toContain('Updated today View current report')
    expect(text(render(overview({ blockedReason: 'NOTHING_NEW' })))).toContain('Nothing new since Oct 30')
  })

  it('lists past reports with their behaviors, unknown results included, and skips unknown kinds', () => {
    const html = text(render(overview(), { hasOlder: true }))
    expect(html).toContain('Past Reports')
    expect(html).toContain('Friday, Oct 30, 2026')
    expect(html).toContain('Buying because the price was moving Momentum chasing +$1,240')
    expect(html).toContain('Decisions where you wrote about feeling anxious Emotional decisions Results not known yet')
    expect(html).toContain('Your largest buys Position sizing −$420')
    expect(html).not.toContain('news_drift')
    expect(html).toContain('Show older reports')
  })

  it('says a failed day is used, and that nothing was lost', () => {
    const html = render(overview({ status: 'FAILED_TODAY', blockedReason: 'FAILED_TODAY' }))
    expect(html).toContain('generate again tomorrow')
    expect(html).toContain('View current report')
  })

  it('lists what is still forming when a run found nothing that qualifies', () => {
    const html = text(render(overview({
      reports: [], blockedReason: 'UPDATED_TODAY',
      lastRun: { outcome: 'EMPTY', at: '2026-10-30T12:00:00Z', needs: [{ kind: 'fomo', subject: null, more: 2, reason: 'ENTRIES' }] },
    })))
    expect(html).toContain('Nothing stands out yet')
    expect(html).toContain('Buying so as not to miss out Write about 2 more trades')
  })

  it('keeps the rest of Vestry usable when hindsight or vestry is unreachable', () => {
    expect(render(overview({ unavailable: true, reports: [] }))).toContain('Insights can’t be reached right now')
    expect(render(undefined, { unreachable: true })).toContain('Insights can’t be reached right now')
  })

  it('plays Generate in the demo once a report exists, and never calls it before', () => {
    expect(render(overview({ canGenerate: true, blockedReason: null }), { isDemo: true })).toContain('>Generate report<')
    const none = render(overview({ reports: [], canGenerate: false, blockedReason: null }), { isDemo: true })
    expect(none).toContain('The demo’s report is being prepared.')
    expect(none).not.toContain('Generate report')
    const played = render(overview({ canGenerate: true, blockedReason: null }), { isDemo: true, demoGenerated: true })
    expect(played).toContain('View current report')
    expect(played).not.toContain('Generate report')
  })

  it('shows a generate error', () => {
    expect(render(overview(), { generateError: 'A new report isn’t available yet' })).toContain('A new report isn’t available yet')
  })
})

describe('report view', () => {
  it('fills the Insights area with every card in a row, the current one shown, and circular arrows', () => {
    const html = render(overview(), { pane: card(1) })
    expect(html).toMatch(/class="fixed z-30/)
    expect(text(html)).toContain('Friday, Oct 30, 2026 2 of 4')
    expect(html).toContain('translateX(-100%)')
    expect(html.match(/aria-hidden="false"/g)).toHaveLength(1)
    expect(html.match(/aria-hidden="true" class="h-full w-full/g)).toHaveLength(3)
    expect(html).toMatch(/aria-label="Previous behavior"[^>]*rounded-full/)
    expect(html).toMatch(/aria-label="Next behavior"/)
    expect(text(html)).not.toMatch(/\b(Previous|Next)\b(?! behavior)/)
    expect(html).toContain('← Back')
  })

  it('closes the report with what is still forming and a way to past reports', () => {
    const html = render(overview(), { pane: card(3) })
    expect(text(html)).toContain('4 of 4')
    expect(text(html)).toContain('Still forming Buying without an exit plan Write about 2 more trades')
    expect(html).toContain('View past reports')
    expect(html).toMatch(/aria-label="Next behavior"[^>]*disabled/)
  })

  it('shows a calm loading view while generating, with no percent or countdown', () => {
    const html = render(overview({ status: 'GENERATING' }), { pane: { kind: 'generating' } })
    expect(html).toContain('Reading your journal and trades')
    expect(html).toContain('← Back')
    expect(html).toContain('Generating…')
    expect(html).not.toMatch(/\d+%/)
  })

  it('uses no "·" anywhere on the page', () => {
    for (const index of [0, 1, 2, 3]) expect(render(overview(), { pane: card(index) })).not.toContain('·')
  })
})

describe('behavior card', () => {
  const [priceAction, anxious, concentration, sizing] = demoReport.behaviors
  const entry = (id: number, timestamp: string): JournalEntry => ({
    id, timestamp, entryType: 'BUY', body: '', ticker: null, priceSnapshot: null, tags: [],
  })
  const renderCard = (index: number, entries?: JournalEntry[]) => {
    const behavior = [priceAction, anxious, concentration, sizing][index]
    return renderToString(
      <QueryClientProvider client={createQueryClient()}>
        <BehaviorCard behavior={behavior} report={demoReport} titleId="t" entries={entries} onOpenEntry={noop} />
      </QueryClientProvider>,
    )
  }

  it('shows results against the baseline, the observation, quotes and a question', () => {
    const html = renderCard(0)
    const words = text(html)
    expect(words).toContain('Buying because the price was moving')
    // closed, one line each; open, how many gained and the average per decision
    expect(words).toContain('These 5 decisions +$1,240 +8.4% 4 of 5 gained Total +$1,240 , average return +8.4% Average per decision +$248')
    expect(words).toContain('Your other 6 decisions +$2,210 +12.1% 4 of 5 gained, 1 not known yet')
    expect(html.match(/<details class="group\/row">/g)).toHaveLength(2)
    expect(words).toContain('Since your report on Oct 27: 1 new decision')
    expect(html).toContain('It keeps going up, I don’t want to be left behind')
    // a deleted entry's words aren't shown again
    expect(html).toContain('Entry deleted')
    expect(html).not.toContain('removed words')
    expect(words).toContain('What would you have needed to see')
  })

  it('ends with the evidence, then the reactions and a note', () => {
    const html = renderCard(0, [entry(21, '2026-10-16T15:00:00Z')])
    const at = (s: string) => html.indexOf(s)
    expect(at('Evidence')).toBeGreaterThan(at('A question to consider'))
    expect(at('This fits')).toBeGreaterThan(at('Evidence'))
    expect(at('Write about this')).toBeGreaterThan(at('Evidence'))
    expect(html).toContain('aria-label="Oct 16, 2026: 1 entry quoted"')
    expect(text(html)).toContain('Oct')
  })

  it('says when no entries are behind a behavior', () => {
    expect(renderCard(2, [entry(21, '2026-10-16T15:00:00Z')])).toContain('No journal entries quoted for this one.')
  })

  it('shows a group without outcomes as not known yet, never as gains of all decisions', () => {
    const words = text(renderCard(1))
    expect(words).toContain('These 4 decisions Not known yet None of these has a later price yet')
    expect(words).not.toMatch(/of 4 gained/)
  })

  it('keeps a behavior’s figures when hindsight left out its text', () => {
    const html = renderCard(2)
    expect(text(html)).toContain('In a bad month (about 1 in 20), this could be about −$1,840')
    expect(html).not.toContain('A question to consider')
  })

  it('shows the saved reaction', () => {
    expect(renderCard(3)).toMatch(/aria-pressed="true"[^>]*>This fits</)
  })
})
