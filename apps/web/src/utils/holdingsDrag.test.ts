import { describe, expect, it } from 'vitest'
import { holdingSlotAt, type HoldingSlot } from './holdingsDrag'
import { moveHoldingsCard, type HoldingsLayout } from './holdingsLayout'

const layout: HoldingsLayout = { v: 1, cards: [['sector', 1], ['value', 1], ['reflection', 1]] }
const slots: HoldingSlot[] = [
  { id: 'sector', x: 0, y: 0, width: 400, height: 500 },
  { id: 'value', x: 424, y: 0, width: 400, height: 500 },
  { id: 'reflection', x: 0, y: 524, width: 400, height: 180 },
]

describe('holdings drag destinations', () => {
  it('keeps a short card in the first slot even when the taller cards reflow beneath the pointer', () => {
    // This pointer lies below the short card's natural height in the new first row.
    const point = { x: 200, y: 450 }
    for (let pass = 0; pass < 10; pass++) {
      const target = holdingSlotAt(slots, point)!
      const preview = moveHoldingsCard(layout, 'reflection', target)
      expect(preview.cards.map(([id]) => id)).toEqual(['reflection', 'sector', 'value'])
    }
    expect(layout.cards.map(([id]) => id)).toEqual(['sector', 'value', 'reflection'])
  })

  it('allows returning to the starting slot and leaves gaps without a new destination', () => {
    expect(holdingSlotAt(slots, { x: 410, y: 200 })).toBeUndefined()
    expect(holdingSlotAt(slots, { x: 200, y: 800 })).toBeUndefined()
    const target = holdingSlotAt(slots, { x: 200, y: 600 })!
    expect(moveHoldingsCard(layout, 'reflection', target)).toBe(layout)
  })
})
