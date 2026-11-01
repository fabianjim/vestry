import type { Behavior, BehaviorFigure, BehaviorTrade } from '../../types/insights'
import type { JournalEntry, JournalEntryType, JournalFilters, Tag } from '../../types/journal'

/*
 * One fictional investor's spring 2026, shared by every landing section so the numbers agree.
 * The May buys each say when they'd sell; the June buys don't. Analyze reports that habit.
 * Jun 18 is a Thursday; Jun 19 is a market holiday. Timestamps are New York time (UTC-4).
 */

// Tag colors come from the server palette in TagService.
const tag = (id: number, name: string, color: string): Tag => ({ id, name, color })
export const TAGS = {
  fed: tag(1, 'fed', '#5e9ed6'),
  semis: tag(2, 'semis', '#8b5cf6'),
  rebalance: tag(3, 'rebalance', '#d6965e'),
  thesis: tag(4, 'thesis', '#f59e0b'),
  dividends: tag(5, 'dividends', '#ec4899'),
} satisfies Record<string, Tag>

const entry = (
  id: number, entryType: JournalEntryType, ticker: string | null, timestamp: string,
  priceSnapshot: number | null, tags: Tag[], body: string, sourceEntryId?: number,
): JournalEntry => ({ id, entryType, ticker, timestamp, priceSnapshot, tags, body, sourceEntryId })

export const SPY_BUY = entry(10, 'BUY', 'SPY', '2026-06-18T19:50:00Z', 750, [TAGS.fed],
  'Bought near close as markets begin to rebound after yesterday’s debut from the new Fed chair.')
export const NVDA_INSIGHT = entry(9, 'INSIGHT', 'NVDA', '2026-06-18T17:45:00Z', 178.9, [TAGS.semis],
  'I expect demand for data-center chips to grow. I’ll reconsider if customers start cutting spending.')
export const AAPL_SELL = entry(8, 'SELL', 'AAPL', '2026-06-18T15:35:00Z', 232.4, [TAGS.rebalance],
  'Trimmed AAPL after the run-up. It had grown past a quarter of my portfolio.')

const NVDA_BUY = entry(2, 'BUY', 'NVDA', '2026-06-03T14:45:00Z', 164.5, [TAGS.semis],
  'Starting a small NVDA position ahead of earnings season. Data-center demand is the thesis.')
const MSFT_INSIGHT = entry(6, 'INSIGHT', 'MSFT', '2026-06-16T14:20:00Z', 512.3, [TAGS.thesis],
  'Cloud growth is the whole reason I own MSFT. If that slows, I should revisit the position, not the headlines.')
const KO_BUY = entry(3, 'BUY', 'KO', '2026-06-08T17:30:00Z', 71.6, [TAGS.dividends],
  'Added KO for steady dividends. Not expecting much growth here.')
const JPM_SELL = entry(4, 'SELL', 'JPM', '2026-06-10T15:05:00Z', 268.15, [TAGS.rebalance],
  'Trimmed JPM to bring financials back under 15% of the portfolio.')
const NVDA_REFLECTION = entry(5, 'REFLECTION', 'NVDA', '2026-06-12T19:10:00Z', 171.2, [TAGS.semis],
  'Up since I bought, but I wrote nothing about valuation. Next time I’ll note what would make me trim.', NVDA_BUY.id)

const AAPL_BUY = entry(11, 'BUY', 'AAPL', '2026-05-04T14:10:00Z', 205, [TAGS.thesis],
  'Bought AAPL for services growth. If it grows past a quarter of my portfolio, I’ll trim it back.')
const JPM_BUY = entry(12, 'BUY', 'JPM', '2026-05-12T15:30:00Z', 255, [TAGS.thesis],
  'Added JPM for steady earnings. I’ll trim if financials go past 15% of the portfolio.')
const MSFT_BUY = entry(13, 'BUY', 'MSFT', '2026-05-20T17:00:00Z', 498, [TAGS.thesis],
  'Bought MSFT for cloud growth. If Azure slows two quarters in a row, I’ll sell.')

/** Newest first, as the journal lists them. The three story entries are the latest. */
export const JOURNAL_ENTRIES: JournalEntry[] = [
  SPY_BUY,
  NVDA_INSIGHT,
  AAPL_SELL,
  entry(7, 'MARKET_EVENT', null, '2026-06-17T18:30:00Z', null, [TAGS.fed],
    'New Fed chair’s first press conference. Markets slipped through the Q&A, then steadied into the close.'),
  MSFT_INSIGHT,
  NVDA_REFLECTION,
  JPM_SELL,
  KO_BUY,
  NVDA_BUY,
  entry(1, 'MARKET_EVENT', null, '2026-06-02T20:00:00Z', null, [TAGS.fed],
    'Rates held steady. The statement hinted a new Fed chair would take over by summer.'),
  MSFT_BUY,
  JPM_BUY,
  AAPL_BUY,
]

/* Hero: portfolio value through Jun 18, on a same-day clock for the chart axis. */

const CHART_DAY = new Date(2026, 5, 18)

function chartTime(label: string): number {
  const [clock, modifier] = label.split(' ')
  const [hour, minute = 0] = clock.split(':').map(Number)
  const date = new Date(CHART_DAY)
  date.setHours(modifier === 'PM' && hour !== 12 ? hour + 12 : modifier === 'AM' && hour === 12 ? 0 : hour, minute, 0, 0)
  return date.getTime()
}

export type PortfolioPoint = { time: number; label: string; value: number }

export const PORTFOLIO_DAY: PortfolioPoint[] = ([
  ['10 AM', 46000], ['11 AM', 47400], ['11:35 AM', 49000], ['12 PM', 46400], ['1 PM', 43900],
  ['1:45 PM', 46200], ['2 PM', 47400], ['3 PM', 45800], ['3:50 PM', 45250],
] as [string, number][]).map(([label, value]) => ({ time: chartTime(label), label, value }))

export const PORTFOLIO_AXIS_TICKS = ['10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '3:50 PM'].map(chartTime)

/** Story entries in the order the hero reaches them, each placed on its portfolio point. */
export const HERO_EVENTS = [
  { entry: AAPL_SELL, time: chartTime('11:35 AM'), value: 49000 },
  { entry: NVDA_INSIGHT, time: chartTime('1:45 PM'), value: 46200 },
  { entry: SPY_BUY, time: chartTime('3:50 PM'), value: 45250 },
]

/* Analyze: one behavior report as of Jun 23, counted from the trades below. */

export const REPORT_AS_OF = '2026-06-23'
const PRICE_AS_OF: Record<string, number> = { AAPL: 229.5, JPM: 266, MSFT: 509, NVDA: 181.4, KO: 70.2, SPY: 768 }

// Each trade shares its journal entry's time and price.
const trade = (tradeId: number, side: 'BUY' | 'SELL', shares: number, { ticker, timestamp, priceSnapshot }: JournalEntry): BehaviorTrade =>
  ({ tradeId, tradeExists: true, ticker, side, shares, price: priceSnapshot, timestamp })

const PLANNED_BUYS = [trade(1, 'BUY', 60, AAPL_BUY), trade(2, 'BUY', 25, JPM_BUY), trade(3, 'BUY', 8, MSFT_BUY)]
const UNPLANNED_BUYS = [trade(4, 'BUY', 20, NVDA_BUY), trade(5, 'BUY', 40, KO_BUY), trade(8, 'BUY', 12, SPY_BUY)]

/** Oldest first. */
export const TRADES: BehaviorTrade[] = [
  ...PLANNED_BUYS, ...UNPLANNED_BUYS, trade(6, 'SELL', 5, JPM_SELL), trade(7, 'SELL', 8, AAPL_SELL),
].sort((a, b) => a.timestamp!.localeCompare(b.timestamp!))

// The figures hindsight would send for a group: each buy against its price on REPORT_AS_OF.
function results(buys: BehaviorTrade[], prefix: '' | 'baseline_'): BehaviorFigure[] {
  const pnls = buys.map(buy => buy.shares! * (PRICE_AS_OF[buy.ticker!] - buy.price!))
  const returns = buys.map(buy => PRICE_AS_OF[buy.ticker!] / buy.price! - 1)
  const pnl = pnls.reduce((sum, value) => sum + value, 0)
  return [
    { key: 'decisions', value: buys.length, unit: 'count' },
    { key: 'outcomes', value: buys.length, unit: 'count' },
    { key: 'gains', value: pnls.filter(value => value > 0).length, unit: 'count' },
    { key: 'pnl', value: pnl, unit: 'money' },
    { key: 'avg_pnl', value: pnl / buys.length, unit: 'money' },
    { key: 'avg_return', value: returns.reduce((sum, value) => sum + value, 0) / buys.length, unit: 'fraction' },
  ].map(figure => ({ ...figure, key: prefix + figure.key }))
}

const cite = (entry: JournalEntry, quote: string) => ({ entryId: entry.id, quote, entryExists: true })

/** The June buys never said when they'd sell. Only the observation and question stand in for model text. */
export const BEHAVIOR: Behavior = {
  kind: 'no_plan',
  subject: null,
  figures: [...results(UNPLANNED_BUYS, ''), ...results(PLANNED_BUYS, 'baseline_')],
  previous: null,
  observation: 'Your May buys each said when you would sell, and you still check against those plans. Your June buys didn’t, even after you wrote that you would next time.',
  question: 'What would tell you the rebound you bought SPY for has run its course?',
  citations: [
    cite(AAPL_BUY, 'If it grows past a quarter of my portfolio, I’ll trim it back.'),
    cite(MSFT_INSIGHT, 'If that slows, I should revisit the position, not the headlines.'),
    cite(NVDA_REFLECTION, 'Next time I’ll note what would make me trim.'),
  ],
  trades: UNPLANNED_BUYS,
  entries: [],
  feedback: null,
  notes: [],
}

/* Reflect: the scripted filter sequence. `shown` drives the filter bar; `applied` drives the list. */

export type JournalScriptStep = { at: number; shown: JournalFilters; applied: JournalFilters }

function buildJournalScript(): JournalScriptStep[] {
  const steps: JournalScriptStep[] = [{ at: 0, shown: {}, applied: {} }]
  const last = () => steps[steps.length - 1]
  const show = (at: number, update: Partial<JournalFilters>) =>
    steps.push({ at, shown: { ...last().shown, ...update }, applied: last().applied })
  const apply = (at: number) => steps.push({ at, shown: last().shown, applied: last().shown })

  const types: JournalEntryType[] = ['BUY', 'SELL', 'INSIGHT']
  types.forEach((_, i) => show(500 + i * 200, { types: types.slice(0, i + 1) }))
  apply(1150)
  const tagIds = [TAGS.fed.id, TAGS.semis.id, TAGS.rebalance.id]
  tagIds.forEach((_, i) => show(1700 + i * 200, { tagIds: tagIds.slice(0, i + 1) }))
  apply(2350)
  show(2900, { from: '2026-06-18' })
  show(3100, { to: '2026-06-18' })
  apply(3400)
  return steps
}

export const JOURNAL_SCRIPT = buildJournalScript()
export const JOURNAL_TAGS: Tag[] = Object.values(TAGS)
