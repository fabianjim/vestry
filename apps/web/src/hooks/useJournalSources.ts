import { useQueries } from '@tanstack/react-query'
import type { JournalEntry } from '../types/journal'
import { journalQueries } from '../services/queries'

// Reuse visible entries; cache filtered-out reflection sources by ID across views.
export function useJournalSources(entries: JournalEntry[]) {
  const knownIds = new Set(entries.map(entry => entry.id))
  const missingIds = [...new Set(entries.flatMap(entry =>
    entry.sourceEntryId != null && !knownIds.has(entry.sourceEntryId) ? [entry.sourceEntryId] : []
  ))]
  const queries = useQueries({ queries: missingIds.map(id => journalQueries.entry(id)) })
  const sources = new Map<number, JournalEntry | null>()
  queries.forEach((query, index) => {
    if (query.data || query.isError) sources.set(missingIds[index], query.data ?? null)
  })
  entries.forEach(entry => sources.set(entry.id, entry))
  return sources
}
