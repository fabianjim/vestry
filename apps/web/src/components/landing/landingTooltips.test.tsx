import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import LandingChart from './LandingChart'
import LandingDetailCard from './LandingDetailCard'

const hover = vi.hoisted(() => ({ label: '' as string | number, value: 0, playbackDone: false }))

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => children,
  LineChart: ({ children }: { children: ReactNode }) => children,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  ReferenceDot: () => null,
  Customized: () => null,
  Tooltip: ({ active, content }: {
    active?: boolean
    content: (props: { active: boolean; label: string | number; payload: { value: number; color: string }[] }) => ReactNode
  }) => active === false ? null : content({
    active: true,
    label: hover.label,
    // The hero's invisible line must not make its tooltip value invisible too.
    payload: [{ value: hover.value, color: 'transparent' }],
  }),
}))
vi.mock('../../hooks/useHeroPlayback', () => ({
  useHeroPlayback: () => ({
    frame: { done: hover.playbackDone, visible: 0, typed: [0, 0, 0] },
    subscribe: vi.fn(),
  }),
}))

it('keeps the hero tooltip hidden until playback finishes, then shows time and currency', () => {
  hover.label = new Date(2026, 5, 18, 11, 35).getTime()
  hover.value = 49000
  hover.playbackDone = false
  expect(renderToStaticMarkup(<LandingChart />)).not.toContain('11:35 AM: $49,000')
  hover.playbackDone = true
  const markup = renderToStaticMarkup(<LandingChart />)
  expect(markup).toContain('11:35 AM: $49,000')
  expect(markup).toContain('bg-elevated px-3 py-2 text-sm text-foreground')
})

it('uses the same one-line date and currency tooltip for Analyze', () => {
  hover.label = 'Jun 18'
  hover.value = 750
  const markup = renderToStaticMarkup(<LandingDetailCard />)
  expect(markup).toContain('Jun 18: $750')
  expect(markup).toContain('bg-elevated px-3 py-2 text-sm text-foreground')
})
