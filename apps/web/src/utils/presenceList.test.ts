import { describe, expect, it } from 'vitest'
import { mergePresence, type Presence } from './presenceList'

const shown = (...ids: number[]): Presence<{ id: number }>[] => ids.map(id => ({ item: { id }, status: 'shown' }))
const summary = (list: Presence<{ id: number }>[]) => list.map(entry => `${entry.item.id}:${entry.status}`)

describe('mergePresence', () => {
  it('keeps removed items in place to exit and adds new items to enter', () => {
    expect(summary(mergePresence(shown(1, 2, 3, 4), [{ id: 2 }, { id: 4 }, { id: 5 }])))
      .toEqual(['1:exit', '2:shown', '3:exit', '4:shown', '5:enter'])
  })

  it('reopens an item that returns while it is exiting and uses the latest item data', () => {
    const prev: Presence<{ id: number; body?: string }>[] = [{ item: { id: 1 }, status: 'exit' }, ...shown(2)]
    const merged = mergePresence(prev, [{ id: 1, body: 'edited' }, { id: 2 }])
    expect(merged.map(entry => entry.status)).toEqual(['shown', 'shown'])
    expect(merged[0].item.body).toBe('edited')
  })
})
