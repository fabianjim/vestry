import type { Behavior, BehaviorFigure, BehaviorNeed, BehaviorReport, GenerateBlocked, ReportSummary } from '../types/insights'
import type { JournalEntry } from '../types/journal'
import { marketDay } from './dateUtils'
import { formatCompactCurrency } from './formatUtils'

// Titles and figures are written here, never by the model, so they stay fixed and plain.
// Each kind has an observable title and its common name, shown muted beside it.
const KINDS = {
  no_plan: { title: 'Buying without an exit plan', name: 'No exit plan' },
  undocumented: { title: 'Trades you didn’t write about', name: 'Undocumented trades' },
  emotional: { title: 'Decisions made under a strong feeling', name: 'Emotional decisions' },
  fomo: { title: 'Buying so as not to miss out', name: 'FOMO' },
  hype: { title: 'Buying on news or social buzz', name: 'Hype' },
  run_up: { title: 'Buying after a run-up', name: 'Chased entry' },
  overtrading: { title: 'Busy weeks and quick round trips', name: 'Overtrading' },
  overconfidence: { title: 'Buys made with high conviction', name: 'Overconfidence' },
  price_action: { title: 'Buying because the price was moving', name: 'Momentum chasing' },
  loss_aversion: { title: 'Holding losses longer than gains', name: 'Loss aversion' },
  short_term: { title: 'Selling before your stated horizon', name: 'Short-termism' },
  risk_concentration: { title: 'Large positions with no exit plan', name: 'Concentration risk' },
  position_sizing: { title: 'Your largest buys', name: 'Position sizing' },
} as const

export type BehaviorKind = keyof typeof KINDS
type Identity = { kind: string; subject: string | null }

export const isKnownKind = (kind: string): kind is BehaviorKind => Object.hasOwn(KINDS, kind)

const EMOTIONS: Record<string, string> = { fomo: 'FOMO' }
const emotion = (value: string) => EMOTIONS[value] ?? value.replaceAll('_', ' ')
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export function behaviorTitle({ kind, subject }: Identity): string {
  if (!isKnownKind(kind)) return ''
  if (kind === 'emotional' && subject) return `Decisions where you wrote about feeling ${emotion(subject)}`
  return KINDS[kind].title
}

export function behaviorName({ kind }: Identity): string {
  return isKnownKind(kind) ? KINDS[kind].name : ''
}

/** "kind" or "kind:subject", as the API stores it on an entry written about the behavior. */
export const behaviorKey = ({ kind, subject }: Identity) => (subject ? `${kind}:${subject}` : kind)

// what one member of the group is, for kinds whose members aren't single decisions
const NOUNS: Partial<Record<BehaviorKind, [string, string]>> = {
  loss_aversion: ['closed position', 'closed positions'],
  risk_concentration: ['holding', 'holdings'],
}
const noun = (kind: string): [string, string] => (isKnownKind(kind) && NOUNS[kind]) || ['decision', 'decisions']

const figureMap = (figures: BehaviorFigure[]) => new Map(figures.map(figure => [figure.key, figure.value]))

/** P/L and returns are signed and colored by the caller; everything else is plain. */
export const signedMoney = (value: number) => `${value < 0 ? '−' : '+'}${formatCompactCurrency(Math.abs(value))}`
export const signedPercent = (fraction: number) => `${fraction < 0 ? '−' : '+'}${Math.abs(fraction * 100).toFixed(1)}%`
const share = (fraction: number) => `${Math.round(fraction * 100)}%`

/**
 * A group's results. `known` is null when hindsight sent no outcomes: none of the decisions has a result yet.
 * Gains count out of the decisions with a result, never out of all of them.
 */
export type Result = {
  label: string
  // avgPnl is per decision, when hindsight sent it
  known: { pnl: number; avgReturn: number; avgPnl: number | null; detail: string } | null
  // what one member is, for "Average per decision"
  noun: string
}

function result(values: Map<string, number>, prefix: '' | 'baseline_', kind: string): Result | null {
  const decisions = values.get(`${prefix}decisions`)
  if (decisions == null) return null
  const [one, many] = noun(kind)
  const label = prefix ? `Your other ${plural(decisions, one, many)}` : decisions === 1 ? `This ${one}` : `These ${decisions} ${many}`
  const [outcomes, gains, pnl, avgReturn] = ['outcomes', 'gains', 'pnl', 'avg_return'].map(key => values.get(prefix + key))
  if (!outcomes || gains == null || pnl == null || avgReturn == null) return { label, known: null, noun: one }
  const unknown = decisions - outcomes
  const detail = `${gains} of ${outcomes} gained${unknown > 0 ? `, ${unknown} not known yet` : ''}`
  return { label, known: { pnl, avgReturn, avgPnl: values.get(`${prefix}avg_pnl`) ?? null, detail }, noun: one }
}

/** The consequence line: the group against the rest of the user's own history, when hindsight sent one. */
export function consequence(behavior: Pick<Behavior, 'kind' | 'figures'>): { group: Result | null; baseline: Result | null } {
  const values = figureMap(behavior.figures)
  return { group: result(values, '', behavior.kind), baseline: result(values, 'baseline_', behavior.kind) }
}

/** The kind's own figures, worded. Unknown keys are skipped. */
export function kindFacts(behavior: Pick<Behavior, 'kind' | 'figures'>): string[] {
  const values = figureMap(behavior.figures)
  const n = (key: string) => values.get(key)
  const vs = (key: string, word: (v: number) => string, what: string) => {
    const v = n(key)
    return v == null ? '' : `, against ${word(v)} for ${what}`
  }
  const facts: (string | null)[] = []
  const add = (key: string, line: (v: number) => string) => {
    const v = n(key)
    if (v != null) facts.push(line(v))
  }
  const days = (v: number) => plural(Math.round(v), 'day', 'days')

  add('median_run_up', v => `Typical rise in the five weeks before buying: ${signedPercent(v)}${vs('baseline_median_run_up', signedPercent, 'your other buys')}`)
  add('from_news_or_social', v => `${v} of these came from news or social media`)
  add('burst_weeks', v => plural(v, 'unusually busy week', 'unusually busy weeks'))
  add('round_trips', v => plural(v, 'position opened and closed quickly', 'positions opened and closed quickly'))
  add('median_trades_per_week', v => `A typical week has ${plural(v, 'trade', 'trades')}`)
  add('right_for_wrong_reason', v => `${v} gained though you later wrote the thesis didn’t play out`)
  if (behavior.kind === 'loss_aversion') {
    add('median_days', v => `Losses were held ${days(v)} at the median${vs('baseline_median_days', days, 'gains')}`)
    add('open_losses_held_longer', v => `${plural(v, 'open loss is', 'open losses are')} already held longer than a typical gain`)
  } else {
    add('median_days', v => `Sold after ${days(v)} at the median`)
  }
  add('avg_weight', v => `Average size: ${share(v)} of the portfolio${vs('baseline_avg_weight', share, 'your other buys')}`)
  add('large_low_conviction', v => `${v} written with low or no stated conviction`)
  add('largest_weight', v => `Largest of these: ${share(v)} of the portfolio`)
  add('sector_weight', v => `Their sector: ${share(v)} of the portfolio`)
  add('possible_monthly_loss', v => `In a bad month (about 1 in 20), this could be about ${signedMoney(-Math.abs(v))}`)
  return facts.filter((fact): fact is string => !!fact)
}

const shortDay = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
const longDay = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' })

/** A report's New York day, e.g. "Oct 27". */
export const reportDayShort = (day: string) => shortDay.format(Date.parse(day))
/** e.g. "Tuesday, Oct 27, 2026" */
export const reportDayLong = (day: string) => `${weekday.format(Date.parse(day))}, ${longDay.format(Date.parse(day))}`

/** What changed since the newest earlier report holding the same behavior; null when there wasn't one. */
export function sinceLast(behavior: Pick<Behavior, 'kind' | 'figures' | 'previous'>): string | null {
  if (!behavior.previous) return null
  const now = figureMap(behavior.figures)
  const then = figureMap(behavior.previous.figures)
  const [one, many] = noun(behavior.kind)
  const parts: string[] = []
  const [d1, d0] = [now.get('decisions'), then.get('decisions')]
  if (d1 != null && d0 != null) {
    const diff = d1 - d0
    parts.push(diff > 0 ? plural(diff, `new ${one}`, `new ${many}`) : diff < 0 ? `${plural(-diff, one, many)} fewer` : `No new ${many}`)
  }
  const [r1, r0] = [now.get('avg_return'), then.get('avg_return')]
  if (r1 != null && r0 != null && signedPercent(r1) !== signedPercent(r0)) {
    parts.push(`average return from ${signedPercent(r0)} to ${signedPercent(r1)}`)
  }
  if (!parts.length) return null
  const text = parts.join(', ')
  return `Since your report on ${reportDayShort(behavior.previous.day)}: ${text[0].toLowerCase()}${text.slice(1)}`
}

/** Why Generate isn't offered, for the Open latest report button. */
export function blockedReason(reason: GenerateBlocked | null, latest: ReportSummary | undefined): string | null {
  if (reason === 'UPDATED_TODAY') return 'Updated today'
  if (reason === 'NOTHING_NEW') return latest ? `Nothing new since ${reportDayShort(latest.day)}` : 'Nothing new yet'
  return null
}

export const FAILED_TODAY = 'The report couldn’t be generated today. Nothing was lost; you can generate again tomorrow.'

export type NeedHint = { name: string; hint: string }

// Never nudges toward trading: hints about trades say when the behavior appears, not what to do.
export function needHint({ kind, subject, more, reason }: BehaviorNeed): NeedHint | null {
  if (!isKnownKind(kind) || more < 1) return null
  const [one, many] = noun(kind)
  const hints: Record<string, string> = {
    ENTRIES: `Write about ${plural(more, 'more trade', 'more trades')}`,
    TRADES: `Appears after ${plural(more, `more ${one}`, `more ${many}`)}`,
    PRICES: 'Waiting on price history',
    FIELDS: 'Still reading your recent entries',
  }
  const hint = hints[reason]
  return hint ? { name: behaviorTitle({ kind, subject }), hint } : null
}

/** The pane's keys: ← and → move between cards, Esc closes. */
export function paneKey(key: string, index: number, count: number): { move: number } | 'close' | null {
  if (key === 'Escape') return 'close'
  if (key === 'ArrowRight' && index < count - 1) return { move: index + 1 }
  if (key === 'ArrowLeft' && index > 0) return { move: index - 1 }
  return null
}

/** The behaviors the page can word, in hindsight's order; cards are numbered from these. */
export const shownBehaviors = <T extends Identity>(behaviors: T[]): T[] => behaviors.filter(b => isKnownKind(b.kind))

/** A day this behavior quoted, placed along the months: position runs from 0 to 1 across the whole span. */
export type EvidenceMark = { date: string; position: number; entryIds: number[]; label: string }
export type EvidenceTimeline = { months: Month[]; marks: EvidenceMark[] }

const monthName = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' })
const monthKey = (date: string) => date.slice(0, 7)
const nextMonth = (key: string) => {
  const [year, month] = key.split('-').map(Number)
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
}
const daysIn = (key: string) => {
  const [year, month] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export type Month = { key: string; label: string }

/**
 * The months a report's cards share, from its earliest quoted entry or trade to its last day. Charts and the
 * evidence strip use the same span, so a day sits at the same place on both and doesn't move between cards.
 */
export function reportMonths(entries: JournalEntry[], report: Pick<BehaviorReport, 'asOf' | 'behaviors'>): Month[] {
  const dayOf = new Map(entries.map(entry => [entry.id, marketDay(entry.timestamp)]))
  const days = shownBehaviors(report.behaviors).flatMap(b => [
    ...b.citations.filter(c => c.entryExists).flatMap(c => dayOf.get(c.entryId) ?? []),
    ...(b.trades ?? []).flatMap(t => (t.tradeExists && t.timestamp ? [marketDay(t.timestamp)] : [])),
  ])
  const sorted = [...days, report.asOf].sort()
  const [first, last] = [sorted[0], sorted[sorted.length - 1]]
  const crossesYear = first.slice(0, 4) !== last.slice(0, 4)
  const months: Month[] = []
  for (let key = monthKey(first); key <= monthKey(last); key = nextMonth(key)) {
    const label = monthName.format(Date.parse(`${key}-01`))
    // the year is shown where it starts, and on the first month when the span crosses one
    const withYear = months.length ? key.endsWith('-01') : crossesYear
    months.push({ key, label: withYear ? `${label} ${key.slice(0, 4)}` : label })
  }
  return months
}

/** Where a New York day sits across the months, from 0 to 1, each month the same width; null outside them. */
export function positionOf(date: string, months: Month[]): number | null {
  const month = months.findIndex(m => m.key === monthKey(date))
  if (month < 0) return null
  return (month + (Number(date.slice(8, 10)) - 0.5) / daysIn(monthKey(date))) / months.length
}

/** Each New York day whose entries this behavior quoted, placed along the report's months. */
export function evidenceTimeline(
  entries: JournalEntry[],
  report: Pick<BehaviorReport, 'asOf' | 'behaviors'>,
  behavior: Pick<Behavior, 'citations'>,
): EvidenceTimeline {
  const months = reportMonths(entries, report)
  const dayOf = new Map(entries.map(entry => [entry.id, marketDay(entry.timestamp)]))
  const byDate = new Map<string, number[]>()
  for (const { entryId, entryExists } of behavior.citations) {
    const date = dayOf.get(entryId)
    if (!entryExists || !date) continue
    const ids = byDate.get(date) ?? []
    if (!ids.includes(entryId)) byDate.set(date, [...ids, entryId])
  }
  const marks = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([date, entryIds]) => {
    const position = positionOf(date, months)
    return position == null ? [] : [{
      date, entryIds, position, label: `${longDay.format(Date.parse(date))}: ${plural(entryIds.length, 'entry', 'entries')} quoted`,
    }]
  })
  return { months, marks }
}
