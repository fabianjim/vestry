import type { JournalEntry, JournalFilters } from '../types/journal'
import { filterDateKey, marketDateKey } from './calendarSelection'
import { isInMarketDateRange } from './dateUtils'

/** Client-side copy of the server's journal matching rules (JournalEntryFilters.java), for static entries. */
export function matchesJournalFilters(entry: JournalEntry, filters: JournalFilters): boolean {
  const query = filters.query?.trim().toLowerCase()
  return (!filters.types?.length || filters.types.includes(entry.entryType))
    && (!filters.tagIds?.length || entry.tags.some(tag => filters.tagIds!.includes(tag.id)))
    && (!filters.dates?.length || filters.dates.includes(marketDateKey(new Date(entry.timestamp))))
    && isInMarketDateRange(entry.timestamp, filterDateKey(filters.from), filterDateKey(filters.to))
    && (!query || entry.body.toLowerCase().includes(query) || !!entry.ticker?.toLowerCase().includes(query))
}
