import { afterEach, describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '../services/queryClient'
import { portfolioQueries } from '../services/queries'
import HoldingsGrid from './HoldingsGrid'

const client = createQueryClient()
const render = () => renderToString(
  <QueryClientProvider client={client}>
    <HoldingsGrid>{([id], _controls, settings) => <p>{`content:${id}; topN:${settings.topN}`}</p>}</HoldingsGrid>
  </QueryClientProvider>,
)
afterEach(() => client.clear())

describe('saved holdings layout', () => {
  it('restores the selected cards, order, and full-row sizes from the session cache', () => {
    client.setQueryData(portfolioQueries.layout().queryKey, {
      v: 1, cards: [['reflection', 2], ['unrealized', 1], ['realized', 1], ['size-return', 1]], topN: 5,
    })
    const html = render()
    expect(html.indexOf('content:reflection')).toBeLessThan(html.indexOf('content:unrealized'))
    expect(html.indexOf('content:unrealized')).toBeLessThan(html.indexOf('content:realized'))
    expect(html).not.toContain('content:sector')
    expect(html.match(/lg:col-span-2/g)).toHaveLength(1)
    expect(html).toContain('content:size-return')
    expect(html).toContain('topN:5')
    expect(html).not.toContain('Drag a handle')
  })

  it('waits for saved preferences and preserves an explicitly empty layout', () => {
    expect(render()).toContain('Loading layout')
    expect(render()).not.toContain('content:sector')
    client.setQueryData(portfolioQueries.layout().queryKey, { v: 1, cards: [] })
    expect(render()).toContain('No analysis cards selected')
    expect(render()).not.toContain('content:sector')
  })

  it('uses the default Top N for layouts saved before concentration preferences existed', () => {
    client.setQueryData(portfolioQueries.layout().queryKey, { v: 1, cards: [['concentration', 1]] })
    expect(render()).toContain('topN:3')
  })
})
