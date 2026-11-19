/**
 * Which journal entries are expanded: a default for every entry, plus the ids
 * the user toggled away from it. Entries that appear later follow the default.
 */
export interface EntryExpansion {
  expandedByDefault: boolean
  toggled: ReadonlySet<number>
}

export function initialExpansion(expandedByDefault: boolean): EntryExpansion {
  return { expandedByDefault, toggled: new Set() }
}

export function isEntryExpanded(state: EntryExpansion, id: number): boolean {
  return state.expandedByDefault !== state.toggled.has(id)
}

export function toggleEntry(state: EntryExpansion, id: number): EntryExpansion {
  const toggled = new Set(state.toggled)
  if (!toggled.delete(id)) toggled.add(id)
  return { ...state, toggled }
}

export function anyEntryExpanded(state: EntryExpansion, ids: readonly number[]): boolean {
  return ids.some((id) => isEntryExpanded(state, id))
}

/** Collapses everything if any visible entry is open, otherwise expands everything. */
export function toggleAllEntries(state: EntryExpansion, ids: readonly number[]): EntryExpansion {
  return initialExpansion(!anyEntryExpanded(state, ids))
}
