import type { InsightNeed, InsightPattern } from '../types/insights'

// Titles and figures are written here, never by the model, so they stay fixed and plain.
const KIND_NAMES = {
  felt_vs_did: 'Feelings and what followed',
  outcomes_by_state: 'Outcomes by state of mind',
  horizon_vs_holding: 'Stated horizon vs. time held',
  gains_vs_losses: 'Holding period: gains vs. losses',
  silent_trades: 'Trades without a note',
  open_theses: 'Theses not revisited',
} as const

export type PatternKind = keyof typeof KIND_NAMES

export const isKnownKind = (kind: string): kind is PatternKind => Object.hasOwn(KIND_NAMES, kind)

const EMOTIONS: Record<string, string> = { fomo: 'FOMO' }
const IDEA_SOURCES: Record<string, string> = {
  own_research: 'your own research',
  news: 'the news',
  social_media: 'social media',
  friend_or_family: 'friends or family',
  professional: 'a professional',
}

const emotion = (value: string) => EMOTIONS[value] ?? value.replaceAll('_', ' ')
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

function stateOfMind(subject: string | null): string | null {
  const [axis, value] = subject?.split(':') ?? []
  if (!value) return null
  if (axis === 'emotion') return `Outcomes when you felt ${emotion(value)}`
  if (axis === 'conviction' && (value === 'high' || value === 'low')) return `Outcomes with ${value} conviction`
  if (axis === 'idea_source' && IDEA_SOURCES[value]) return `Outcomes of ideas from ${IDEA_SOURCES[value]}`
  return null
}

export function patternTitle(pattern: InsightPattern): string {
  if (!isKnownKind(pattern.kind)) return ''
  if (pattern.kind === 'felt_vs_did' && pattern.subject) return `After feeling ${emotion(pattern.subject)}`
  if (pattern.kind === 'outcomes_by_state') return stateOfMind(pattern.subject) ?? KIND_NAMES.outcomes_by_state
  return KIND_NAMES[pattern.kind]
}

/** The kind's fixed name, shown above a title that names a subject; null when the title already is the name. */
export function kindLabel(pattern: InsightPattern): string | null {
  const title = patternTitle(pattern)
  return isKnownKind(pattern.kind) && KIND_NAMES[pattern.kind] !== title ? KIND_NAMES[pattern.kind] : null
}

/** A figure written as a sentence: "3" set large, then "of 4 entries followed by a buy". Never a percentage. */
export type InsightMeasure = { lead: string; rest: string }

// A measure is left out when hindsight didn't send its figures; unknown figure keys are ignored.
export function patternMeasures(pattern: InsightPattern): InsightMeasure[] {
  const figures = new Map(pattern.figures.map(figure => [figure.key, Math.round(figure.value)]))
  const share = (part: string, total: string, one: string, many: string, what: string): InsightMeasure[] => {
    const [count, of] = [figures.get(part), figures.get(total)]
    return count == null || of == null || of < 1 ? [] : [{ lead: String(count), rest: `of ${of} ${of === 1 ? one : many} ${what}` }]
  }
  const held = (key: string, what: string): InsightMeasure[] => {
    const days = figures.get(key)
    return days == null ? [] : [{ lead: plural(days, 'day', 'days'), rest: what }]
  }
  switch (pattern.kind) {
    case 'felt_vs_did':
      return [...share('followed_by_buy', 'entries', 'entry', 'entries', 'followed by a buy'),
        ...share('followed_by_sell', 'entries', 'entry', 'entries', 'followed by a sell')]
    case 'outcomes_by_state':
      return [...share('above_entry_price', 'entries', 'entry', 'entries', 'with the price higher afterward'),
        ...share('below_entry_price', 'entries', 'entry', 'entries', 'with the price lower afterward')]
    case 'horizon_vs_holding':
      return [...share('held_shorter', 'buys', 'buy', 'buys', 'sold sooner than planned'),
        ...share('still_open', 'buys', 'buy', 'buys', 'still held')]
    case 'gains_vs_losses':
      return [...held('gains_median_days', 'median hold for gains'), ...held('losses_median_days', 'median hold for losses'),
        ...share('gains_with_entry', 'gains', 'gain', 'gains', 'with a note'),
        ...share('losses_with_entry', 'losses', 'loss', 'losses', 'with a note')]
    case 'silent_trades':
      return share('without_entry', 'trades', 'trade', 'trades', 'without a note')
    case 'open_theses':
      return share('not_revisited', 'buys_with_thesis', 'buy with a thesis', 'buys with a thesis', 'never revisited')
    default:
      return []
  }
}

export const findingId = (number: number) => `finding-${number}`

/** The subject a title can't carry on its own. */
export function patternContext(pattern: InsightPattern): string | null {
  return pattern.kind === 'horizon_vs_holding' && pattern.subject ? `Stated horizon: ${pattern.subject}` : null
}

/** What each kind looks for, for the page's introduction. */
export const KIND_DESCRIPTIONS: { name: string; description: string }[] = [
  { name: KIND_NAMES.felt_vs_did, description: 'What you did after naming a feeling in an entry' },
  { name: KIND_NAMES.outcomes_by_state, description: 'How prices moved after entries written in a given state of mind' },
  { name: KIND_NAMES.horizon_vs_holding, description: 'How long you held compared with the horizon you stated' },
  { name: KIND_NAMES.gains_vs_losses, description: 'How long gains and losses stayed open' },
  { name: KIND_NAMES.silent_trades, description: 'Trades with no entry around them' },
  { name: KIND_NAMES.open_theses, description: 'Theses you wrote and never returned to' },
]

export type NeedHint = { name: string; hint: string }

// Never nudges toward trading: hints about trades say when the pattern appears, not what to do.
export function needHint({ kind, more }: InsightNeed): NeedHint | null {
  if (!isKnownKind(kind) || more < 1) return null
  const hints: Record<PatternKind, string> = {
    felt_vs_did: `Name a feeling in ${plural(more, 'more entry', 'more entries')}`,
    outcomes_by_state: `Write about ${plural(more, 'more trade', 'more trades')}`,
    horizon_vs_holding: `State a time horizon on ${plural(more, 'more buy', 'more buys')}`,
    gains_vs_losses: `Appears after ${plural(more, 'more closed position', 'more closed positions')}`,
    silent_trades: `Appears after ${plural(more, 'more trade', 'more trades')}`,
    open_theses: `Write a thesis on ${plural(more, 'more buy', 'more buys')}`,
  }
  return { name: KIND_NAMES[kind], hint: hints[kind] }
}

const reportDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric',
})

/** The last day of journal a report read, in New York time like the rest of the journal. */
export function journalUpTo(entriesUpTo: string | null): string | null {
  return entriesUpTo ? reportDate.format(new Date(entriesUpTo)) : null
}
