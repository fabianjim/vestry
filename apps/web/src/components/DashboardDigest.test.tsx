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
  <DashboardDigest state={state} isDemo={isDemo} pending={false} error={false}
    onGenerate={noop} onCheck={noop} onDashboard={noop} />
</MemoryRouter>)

it('offers explicit generation for private accounts and no generate button for demo visitors', () => {
  expect(render(idle)).toContain('Generate briefing')
  expect(render(idle, true)).not.toContain('Generate briefing')
  expect(render(idle, true)).toContain('10 a.m. New York time')
})

it('renders citations and fixed exploration links while treating generated content as text', () => {
  const html = render(ready)
  expect(html).toContain('href="https://news.example/report"')
  expect(html).toContain('rel="noopener noreferrer"')
  expect(html).not.toContain('AI-generated')
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

it('omits the source instruction when news is unavailable', () => {
  const digest = ready.digest!
  const html = render({ ...ready, digest: { ...digest, content: {
    ...digest.content, news: 'News is currently unavailable.', newsStatus: 'UNAVAILABLE', sources: [],
  } } })
  expect(html).not.toContain('AI-generated.')
  expect(html).not.toContain('check the linked sources')
})

it('explains the next scheduled attempt for demo failures without offering generation or dismissal', () => {
  const html = render({ ...ready, status: 'FAILED' }, true)
  expect(html).toContain('next weekday at 10 a.m. New York time')
  expect(html).toContain('Company reported earnings.')
  expect(html).not.toContain('Dismiss')
  expect(html).not.toContain('Generate briefing')
  expect(html).not.toContain('Shared demo briefing')
  expect(html).not.toContain('AI')
})


it('renders a news-only digest with one direct next step and no empty reflection paragraph', () => {
  const digest = ready.digest!
  const html = render({ ...ready, digest: { ...digest, content: {
    ...digest.content, reflection: '', questions: [{ text: 'Review your holdings', destination: 'HOLDINGS' }],
  } } })
  expect(html).toContain('Review your holdings')
  expect(html).toContain('href="/analysis"')
  expect(html.match(/<li /g)).toHaveLength(1)
  expect(html).not.toContain('<p class="text-sm leading-relaxed text-foreground"></p>')
})
