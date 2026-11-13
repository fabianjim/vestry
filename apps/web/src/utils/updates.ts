import type { ShippedUpdate } from '../components/updates/updates'

/** Newest first. Dates are YYYY-MM-DD, so string order is date order. */
export const sortShipped = (entries: ShippedUpdate[]): ShippedUpdate[] =>
  [...entries].sort((a, b) => b.date.localeCompare(a.date))

/**
 * 'YYYY-MM-DD' as 'October 31, 2026'. Formatted in UTC because the value is a calendar day, not an instant:
 * `new Date('2026-10-31')` is UTC midnight, which local formatting would show as Oct 30 west of Greenwich.
 */
export const formatUpdateDate = (date: string): string =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
