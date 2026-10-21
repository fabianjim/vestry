import type { Transaction } from '../types/transaction'
import type { JournalEntry } from '../types/journal'
import { marketDay } from './dateUtils'

export type HistoryPoint = {
  timestamp: string
  portfolioValue: number
}

export type PerformanceRange = '1D' | '1W' | '1M' | '3M' | 'ALL'
export type PerformanceLens = 'value' | 'gain'
/** Inclusive New York market dates, YYYY-MM-DD. */
export type DateWindow = { from: string; to: string }

/**
 * How finely a window plots: one day on a clock, a week of observations, or daily closes
 * labelled by date or by month.
 */
export type Resolution = 'day' | 'week' | 'month' | 'long'

/**
 * One observation of the portfolio. `invested` is the net money put in so far (buys minus sell
 * proceeds), so `value - invested` is the total gain, realized and unrealized.
 */
export type PerformancePoint = {
  time: number
  /** New York market date, YYYY-MM-DD. */
  day: string
  value: number
  invested: number
}

export type ChartRow = PerformancePoint & {
  /** Time on a one-day axis; elsewhere the point's index, so nights and weekends take no space. */
  x: number
  /** Gain since the range's baseline, so the Gain lens and its headline agree. */
  gain: number
  entries: JournalEntry[]
}

export type Selection = { points: PerformancePoint[]; baseline?: PerformancePoint; resolution: Resolution }

export type DatedEntry = { entry: JournalEntry; time: number; day: string }

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY_MS = 24 * HOUR
const GROUP_WINDOW_MS = 2 * MINUTE

const toTime = (timestamp: string) => new Date(timestamp).getTime()
// Market dates are read at UTC noon, so date math and labels match the YYYY-MM-DD key in any timezone.
const dayDate = (day: string) => new Date(`${day}T12:00:00Z`)
const netFlow = (tx: Transaction) => (tx.type === 'BUY' ? tx.totalValue : -tx.totalValue)

// Group transactions so same-type trades within two minutes of each other
// collapse into a single chart event (chained: each trade is within the
// window of the previous trade in its group).
function groupTransactions(transactions: Transaction[]): Transaction[][] {
  const groups: Transaction[][] = []
  for (const tx of transactions) {
    const txTime = toTime(tx.timestamp)
    const lastGroup = groups[groups.length - 1]
    const lastTx = lastGroup?.[lastGroup.length - 1]
    if (
      lastGroup &&
      lastTx &&
      lastTx.type === tx.type &&
      txTime - toTime(lastTx.timestamp) <= GROUP_WINDOW_MS
    ) {
      lastGroup.push(tx)
    } else {
      groups.push([tx])
    }
  }
  return groups
}

/** First index where `matches` holds, for a predicate that is false then true along `items`. */
function firstIndex<T>(items: T[], matches: (item: T) => boolean): number {
  let low = 0
  let high = items.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (matches(items[mid])) high = mid
    else low = mid + 1
  }
  return low
}

/**
 * Merges the server's price history with the trade ledger into one chronological timeline.
 * The server counts a trade in every bucket from the trade's minute onward. A trade group that
 * falls between two observations gets its own point (the previous value plus the money moved), so
 * the step lands at the trade instead of at the next hourly fetch.
 */
export function buildTimeline(history: HistoryPoint[], transactions: Transaction[]): PerformancePoint[] {
  const observed = history
    .map(point => ({ time: toTime(point.timestamp), value: point.portfolioValue, synthetic: false }))
    .sort((a, b) => a.time - b.time)
  const trades = [...transactions].sort((a, b) => toTime(a.timestamp) - toTime(b.timestamp))

  const merged: { time: number; value: number; synthetic: boolean }[] = []
  let next = 0
  for (const group of groupTransactions(trades)) {
    const start = Math.floor(toTime(group[0].timestamp) / MINUTE) * MINUTE
    const end = toTime(group[group.length - 1].timestamp)
    while (next < observed.length && observed[next].time < start) merged.push(observed[next++])
    const previous = merged[merged.length - 1]
    // Nothing to step from, or a fetch already reflects the group and carries the step itself.
    if (!previous || (next < observed.length && observed[next].time <= end)) continue
    merged.push({ time: end, value: previous.value + group.reduce((sum, tx) => sum + netFlow(tx), 0), synthetic: true })
  }
  while (next < observed.length) merged.push(observed[next++])

  // Observations include trades up to the end of their minute, as the server buckets them;
  // a synthetic point includes trades up to its own instant. Both cutoffs only move forward.
  const points: PerformancePoint[] = []
  let invested = 0
  let t = 0
  for (const point of merged) {
    const cutoff = point.synthetic ? point.time : point.time + MINUTE - 1
    while (t < trades.length && toTime(trades[t].timestamp) <= cutoff) invested += netFlow(trades[t++])
    points.push({ time: point.time, day: marketDay(point.time), value: point.value, invested })
  }
  return points
}

/** The last point of each market day. */
export function dailyCloses(timeline: PerformancePoint[]): PerformancePoint[] {
  const closes: PerformancePoint[] = []
  for (const point of timeline) {
    if (closes[closes.length - 1]?.day === point.day) closes[closes.length - 1] = point
    else closes.push(point)
  }
  return closes
}

const RANGE_RESOLUTION: Record<PerformanceRange, Resolution> = { '1D': 'day', '1W': 'week', '1M': 'month', '3M': 'long', ALL: 'long' }

/**
 * The points a range plots, and the baseline its gain is measured from. 1D and 1W use every
 * observation; longer ranges use daily closes. 1D shows the latest market day from the previous
 * close; later ranges open on the point before the window, so the line starts where it left off.
 */
export function selectRange(timeline: PerformancePoint[], closes: PerformancePoint[], range: PerformanceRange): Selection {
  const resolution = RANGE_RESOLUTION[range]
  if (timeline.length === 0) return { points: [], resolution }
  const latest = timeline[timeline.length - 1]

  if (range === '1D') return selectDates(timeline, closes, { from: latest.day, to: latest.day })
  if (range === 'ALL') return { points: closes, resolution }

  const source = range === '1W' ? timeline : closes
  const from = new Date(latest.time)
  if (range === '1W') from.setDate(from.getDate() - 7)
  else from.setMonth(from.getMonth() - (range === '1M' ? 1 : 3))
  const inWindow = firstIndex(source, point => point.time >= from.getTime())
  if (inWindow === 0) return { points: source, resolution }
  return { points: source.slice(inWindow - 1), baseline: source[inWindow - 1], resolution }
}

/**
 * The points between two market dates, measured from the close before them. Up to a week plots
 * every observation; longer spans use daily closes.
 */
export function selectDates(timeline: PerformancePoint[], closes: PerformancePoint[], { from, to }: DateWindow): Selection {
  const days = (dayDate(to).getTime() - dayDate(from).getTime()) / DAY_MS
  const resolution: Resolution = days === 0 ? 'day' : days <= 7 ? 'week' : days <= 62 ? 'month' : 'long'
  const source = days <= 7 ? timeline : closes
  const start = firstIndex(source, point => point.day >= from)
  const end = firstIndex(source, point => point.day > to)
  return { points: source.slice(start, end), baseline: source[start - 1], resolution }
}

/** Journal entries in time order with their market dates, computed once per journal change. */
export function dateEntries(entries: JournalEntry[]): DatedEntry[] {
  return entries
    .map(entry => ({ entry, time: toTime(entry.timestamp), day: marketDay(entry.timestamp) }))
    .sort((a, b) => a.time - b.time)
}

/**
 * Chart rows for a range. Each journal entry sits on the point that covers it: its market day
 * on daily ranges, otherwise the first observation at or after it (or the day's last observation).
 */
export function toRows(
  points: PerformancePoint[],
  baseline: PerformancePoint | undefined,
  entries: DatedEntry[],
  resolution: Resolution,
): ChartRow[] {
  const baseGain = baseline ? baseline.value - baseline.invested : 0
  const rows: ChartRow[] = points.map((point, index) => ({
    ...point,
    x: resolution === 'day' ? point.time : index,
    gain: point.value - point.invested - baseGain,
    entries: [],
  }))
  if (rows.length === 0) return rows

  const daily = resolution === 'month' || resolution === 'long'
  const first = rows[0].day
  const last = rows[rows.length - 1].day
  let row = 0
  for (const { entry, time, day } of entries) {
    if (day < first || day > last) continue
    if (daily) while (rows[row].day < day) row++
    else while (row < rows.length - 1 && rows[row].time < time) row++
    rows[row].entries.push(entry)
  }
  return rows
}

const extent = (values: number[]): [number, number] => {
  let min = Infinity
  let max = -Infinity
  for (const value of values) {
    if (value < min) min = value
    if (value > max) max = value
  }
  return [min, max]
}

/**
 * Fits the plotted series, and the whole reference series (money in, or zero) when it sits near
 * enough to share the axis without flattening the line.
 */
export function yDomain(values: number[], reference: number[]): [number, number] {
  const [min, max] = extent(values)
  const [refMin, refMax] = extent(reference)
  const reach = (max - min) / 2
  const fits = refMin >= min - reach && refMax <= max + reach
  const low = fits ? Math.min(min, refMin) : min
  const high = fits ? Math.max(max, refMax) : max
  const pad = (high - low) * 0.08 || Math.max(Math.abs(high) * 0.01, 1)
  return [low - pad, high + pad]
}

const MAX_TICKS = 7
const hourFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })
// Market dates are formatted in UTC, matching `dayDate`.
const dateFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
const weekdayFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' })
const longDateFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
const monthFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' })
const yearDateFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })

/** "Mon, Oct 19" for a YYYY-MM-DD market date. */
export const formatMarketDay = (day: string) => longDateFormat.format(dayDate(day))

/** "Fri, Oct 16" for one day, "Sep 1 – Oct 16" for a span, with years when they differ. */
export function formatDateWindow({ from, to }: DateWindow): string {
  if (from === to) return formatMarketDay(from)
  const format = from.slice(0, 4) === to.slice(0, 4) ? dateFormat : yearDateFormat
  return `${format.format(dayDate(from))} – ${format.format(dayDate(to))}`
}

/** The tooltip label for a row: its date on daily resolutions, with the time on intraday ones. */
export function formatRowLabel(row: ChartRow, resolution: Resolution): string {
  const date = formatMarketDay(row.day)
  return resolution === 'day' || resolution === 'week' ? `${date}, ${timeFormat.format(row.time)}` : date
}

/** X-axis ticks where the period changes (hour, day or month), thinned to fit. */
export function axisTicks(rows: ChartRow[], resolution: Resolution): { ticks: number[]; labels: Map<number, string> } {
  const labels = new Map<number, string>()
  const pick = (starts: ChartRow[], label: (row: ChartRow) => string) => {
    const step = Math.ceil(starts.length / MAX_TICKS)
    starts.filter((_, i) => i % step === 0).forEach(row => labels.set(row.x, label(row)))
  }
  // Month starts; the first row usually falls mid-month, so it gets no label.
  const months = resolution === 'long'
    ? rows.filter((row, i) => i > 0 && row.day.slice(0, 7) !== rows[i - 1].day.slice(0, 7))
    : []

  if (resolution === 'day') {
    pick(rows.filter(row => row.time % HOUR === 0), row => hourFormat.format(row.time))
  } else if (resolution === 'week') {
    pick(rows.filter((row, i) => i === 0 || row.day !== rows[i - 1].day), row => weekdayFormat.format(dayDate(row.day)))
  } else if (months.length >= 2) {
    pick(months, row => row.day.slice(5, 7) === '01' ? row.day.slice(0, 4) : monthFormat.format(dayDate(row.day)))
  } else {
    pick(rows, row => dateFormat.format(dayDate(row.day)))
  }
  return { ticks: [...labels.keys()], labels }
}
