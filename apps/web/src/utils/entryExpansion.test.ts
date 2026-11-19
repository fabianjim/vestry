import { describe, expect, it } from 'vitest'
import { anyEntryExpanded, initialExpansion, isEntryExpanded, toggleAllEntries, toggleEntry } from './entryExpansion'

describe('entryExpansion', () => {
  it('toggles single entries away from the default, and new entries follow the default', () => {
    const state = toggleEntry(initialExpansion(false), 1)
    expect(isEntryExpanded(state, 1)).toBe(true)
    expect(isEntryExpanded(state, 2)).toBe(false)
    expect(isEntryExpanded(toggleEntry(state, 1), 1)).toBe(false)
  })

  it('collapses all when any visible entry is open, otherwise expands all', () => {
    const ids = [1, 2, 3]
    const oneOpen = toggleEntry(initialExpansion(false), 2)
    const collapsed = toggleAllEntries(oneOpen, ids)
    expect(anyEntryExpanded(collapsed, ids)).toBe(false)

    const expanded = toggleAllEntries(collapsed, ids)
    expect(ids.every((id) => isEntryExpanded(expanded, id))).toBe(true)
  })

  it('ignores open entries that are filtered out of view', () => {
    const hiddenOpen = toggleEntry(initialExpansion(false), 9)
    expect(anyEntryExpanded(hiddenOpen, [1, 2])).toBe(false)
    expect(isEntryExpanded(toggleAllEntries(hiddenOpen, [1, 2]), 1)).toBe(true)
  })
})
