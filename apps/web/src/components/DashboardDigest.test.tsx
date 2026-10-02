import { expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import DashboardDigest from './DashboardDigest'
import type { DigestState } from '../types/digest'

const idle: DigestState = { status: 'IDLE', day: '2026-10-01', digest: null }
const ready: DigestState = { ...idle, status: 'READY', digest: {
  id: 'job', capturedAt: '2026-10-01T15:00:00Z', generatedAt: '2026-10-01T15:01:00Z',
  content: {
    news: 'Company reported earnings.', reflection: '<script>untrusted text</script>',
    questions: [{ text: 'Review concentration?', destination: 'HOLDINGS' }, { text: 'Revisit your reasoning?', destination: 'JOURNAL' }],
    sources: [{ headline: 'Company report', summary: 'Results', publishedOn: '2026-10-01', url: 'https://news.example/report' }],
    newsStatus: 'READY', demoTemplate: false,
  },
} }
const noop = () => {}
const render = (state: DigestState, isDemo = false) => renderToString(<MemoryRouter>
  <DashboardDigest state={state} isDemo={isDemo} pending={false} error={false} dismissing={false}
    onGenerate={noop} onCheck={noop} onDismiss={noop} onDashboard={noop} />
</MemoryRouter>)

it('offers explicit generation for private accounts and no generate button for demo visitors', () => {
  expect(render(idle)).toContain('Generate briefing')
  expect(render(idle)).toContain('OpenAI')
  expect(render(idle, true)).not.toContain('Generate briefing')
  expect(render(idle, true)).toContain('Shared demo briefing')
})

it('renders citations and fixed exploration links while treating generated content as text', () => {
  const html = render(ready)
  expect(html).toContain('href="https://news.example/report"')
  expect(html).toContain('rel="noopener noreferrer"')
  expect(html).toContain('href="/analysis"')
  expect(html).toContain('href="/journal"')
  expect(html).toContain('&lt;script&gt;untrusted text&lt;/script&gt;')
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('Generate briefing')
})

it('renders nothing when disabled or dismissed, and retains the previous briefing after a failed refresh', () => {
  expect(render({ ...ready, status: 'DISABLED' })).toBe('')
  expect(render({ ...ready, status: 'HIDDEN' })).toBe('')
  const failed = render({ ...ready, status: 'FAILED' })
  expect(failed).toContain('try again tomorrow')
  expect(failed).toContain('Company reported earnings.')
})
