export type PresenceStatus = 'enter' | 'shown' | 'exit'
export type Presence<T> = { item: T; status: PresenceStatus }

/**
 * Merges the next list into what is on screen: new items enter, missing items exit in
 * place (after the item that preceded them), and items that return mid-exit reopen.
 */
export function mergePresence<T extends { id: number }>(prev: Presence<T>[], next: T[]): Presence<T>[] {
  const nextIds = new Set(next.map(item => item.id))
  const prevById = new Map(prev.map(entry => [entry.item.id, entry]))
  const departing = new Map<number | null, Presence<T>[]>()
  let anchor: number | null = null
  for (const entry of prev) {
    if (nextIds.has(entry.item.id)) {
      anchor = entry.item.id
    } else {
      departing.set(anchor, [...(departing.get(anchor) ?? []), { item: entry.item, status: 'exit' }])
    }
  }
  const merged = [...(departing.get(null) ?? [])]
  for (const item of next) {
    const was = prevById.get(item.id)
    merged.push({ item, status: was == null ? 'enter' : was.status === 'exit' ? 'shown' : was.status })
    merged.push(...(departing.get(item.id) ?? []))
  }
  return merged
}
