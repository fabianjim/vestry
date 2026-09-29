import type { HoldingsCardId } from './holdingsLayout'

export type HoldingSlot = { id: HoldingsCardId; x: number; y: number; width: number; height: number }

// Slots are captured before reordering. Preview geometry must never become a new input.
export function holdingSlotAt(slots: HoldingSlot[], point: { x: number; y: number }) {
  return slots.find(slot => point.x >= slot.x && point.x < slot.x + slot.width
    && point.y >= slot.y && point.y < slot.y + slot.height)?.id
}
