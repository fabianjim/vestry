import { expect, it } from 'vitest'
import { visibleNavItems } from './navItems'

it('shows Insights after Journal only when hindsight is configured', () => {
  expect(visibleNavItems(false).map(item => item.label)).toEqual(['Dashboard', 'Holdings', 'Transactions', 'Journal'])
  expect(visibleNavItems(true).map(item => item.label)).toEqual(['Dashboard', 'Holdings', 'Transactions', 'Journal', 'Insights'])
})
