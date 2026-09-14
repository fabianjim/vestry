import { useEffect, useMemo, useState } from 'react'
import type { JournalEntry } from '../types/journal'
import { journalApi } from '../services/api'

// Reuse entries already in the list; filtered-out sources are fetched once per ID.
export function useJournalSources(entries: JournalEntry[]) {
  const [fetched, setFetched] = useState<{
    entries: JournalEntry[]
    sources: Map<number, JournalEntry | null>
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    const knownIds = new Set(entries.map(entry => entry.id))
    const missingIds = [...new Set(entries.flatMap(entry =>
      entry.sourceEntryId != null && !knownIds.has(entry.sourceEntryId) ? [entry.sourceEntryId] : []
    ))]
    if (missingIds.length) {
      Promise.all(missingIds.map(async id =>
        [id, await journalApi.getEntry(id).catch(() => null)] as const
      )).then(sources => {
        if (!cancelled) setFetched({ entries, sources: new Map(sources) })
      })
    }
    return () => { cancelled = true }
  }, [entries])

  return useMemo(() => {
    const sources = new Map<number, JournalEntry | null>(fetched?.entries === entries ? fetched.sources : [])
    entries.forEach(entry => sources.set(entry.id, entry))
    return sources
  }, [entries, fetched])
}
