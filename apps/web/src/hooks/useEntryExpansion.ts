import { useState } from 'react'
import { anyEntryExpanded, initialExpansion, isEntryExpanded, toggleAllEntries, toggleEntry } from '../utils/entryExpansion'

export function useEntryExpansion(ids: readonly number[], expandedByDefault: boolean) {
  const [state, setState] = useState(() => initialExpansion(expandedByDefault))
  return {
    isExpanded: (id: number) => isEntryExpanded(state, id),
    toggle: (id: number) => setState((s) => toggleEntry(s, id)),
    anyExpanded: anyEntryExpanded(state, ids),
    toggleAll: () => setState((s) => toggleAllEntries(s, ids)),
  }
}
