export const HOLDINGS_CARDS = {
  sector: { title: 'Sector Allocation', description: 'Allocation across sectors and fund categories.' },
  value: { title: 'Holdings by Value', description: 'The size and weight of each position.' },
  relationships: { title: 'Holding Relationships', description: 'Connections between holdings and your watchlist.' },
  reflection: { title: 'Reflection Overview', description: 'Holdings with little or no recorded reflection.' },
  concentration: { title: 'Concentration Summary', description: 'Explore the weight of your largest positions.' },
  unrealized: { title: 'Unrealized Gain/Loss', description: 'Open positions compared with their remaining cost.' },
  realized: { title: 'Realized Gain/Loss', description: 'Results from sales, including fully sold positions.' },
  'size-return': { title: 'Position Size vs. Return', description: 'Position weights against unrealized returns.' },
} as const

export type HoldingsCardId = keyof typeof HOLDINGS_CARDS
export type HoldingsCard = [HoldingsCardId, 1 | 2]
export type HoldingsLayout = { v: 1; cards: HoldingsCard[]; topN?: number }

export const DEFAULT_HOLDINGS_LAYOUT: HoldingsLayout = {
  v: 1,
  cards: [['sector', 1], ['value', 1], ['size-return', 1], ['concentration', 1], ['relationships', 2]],
}

export function moveHoldingsCard(layout: HoldingsLayout, from: HoldingsCardId, to: HoldingsCardId): HoldingsLayout {
  const start = layout.cards.findIndex(([id]) => id === from)
  const end = layout.cards.findIndex(([id]) => id === to)
  if (start < 0 || end < 0 || start === end) return layout
  const cards = [...layout.cards]
  cards.splice(end, 0, cards.splice(start, 1)[0])
  return { ...layout, cards }
}
