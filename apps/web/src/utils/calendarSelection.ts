import type { JournalFilters } from '../types/journal'

const MARKET_ZONE = 'America/New_York'
const DAY_MS = 86_400_000

export function marketDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MARKET_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => parts.find(p => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function validDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value
}

export function filterDateKey(value?: string): string {
  if (!value) return ''
  if (validDateKey(value)) return value
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? marketDateKey(date) : ''
}

export function dateRange(a: string, b: string): string[] {
  if (!validDateKey(a) || !validDateKey(b)) return []
  const start = Date.parse(a < b ? a : b)
  const end = Date.parse(a < b ? b : a)
  const dates: string[] = []
  for (let time = start; time <= end; time += DAY_MS) dates.push(new Date(time).toISOString().slice(0, 10))
  return dates
}

export function selectedDates(filters: JournalFilters): string[] {
  if (filters.dates?.length) return [...new Set(filters.dates.filter(validDateKey))].sort()
  const from = filterDateKey(filters.from)
  const to = filterDateKey(filters.to)
  return from && to && from <= to ? dateRange(from, to) : []
}

/** Plain selection replaces; additive clicks toggle; additive ranges union. */
export function selectDates(base: string[], start: string, target: string, additive: boolean, range: boolean): string[] {
  const incoming = range ? dateRange(start, target) : [target]
  if (!additive) return incoming
  const result = new Set(base)
  if (!range && result.has(target)) result.delete(target)
  else incoming.forEach(date => result.add(date))
  return [...result].sort()
}

/** Use compact bounds for continuous selections; explicit dates preserve gaps. */
export function dateSelectionFilters(dates: string[]): Pick<JournalFilters, 'from' | 'to' | 'dates'> {
  const sorted = [...new Set(dates.filter(validDateKey))].sort()
  if (!sorted.length) return { from: undefined, to: undefined, dates: undefined }
  const from = sorted[0]
  const to = sorted[sorted.length - 1]
  if ((Date.parse(to) - Date.parse(from)) / DAY_MS + 1 === sorted.length) {
    return { from, to, dates: undefined }
  }
  return { from: undefined, to: undefined, dates: sorted }
}

/** Convert a calendar day to an inclusive instant boundary, respecting NY DST. */
export function marketDayBoundary(value: string, end = false): string {
  if (!validDateKey(value)) return value // Existing instant-based links remain valid.
  const target = Date.parse(value) + (end ? DAY_MS : 0)
  let instant = target
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: MARKET_ZONE, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
  })
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(new Date(instant))
    const part = (type: string) => Number(parts.find(p => p.type === type)!.value)
    const wallTime = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'))
    instant += target - wallTime
  }
  return new Date(instant - (end ? 1 : 0)).toISOString()
}
