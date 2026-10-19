import type { JournalEntry, JournalEntryType, JournalFilters, Tag } from '../../types/journal'
import type { StockHistoryPoint } from '../../types/stock'

/*
 * One fictional investor's June 2026, shared by every landing section so the numbers agree.
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
  'I own NVDA because I expect demand for data-center chips to grow. I’ll reconsider if customers start cutting spending.')
export const AAPL_SELL = entry(8, 'SELL', 'AAPL', '2026-06-18T15:35:00Z', 232.4, [TAGS.rebalance],
  'Trimmed AAPL after the run-up. It had grown past a quarter of my portfolio.')

const NVDA_BUY = entry(2, 'BUY', 'NVDA', '2026-06-03T14:45:00Z', 164.5, [TAGS.semis],
  'Starting a small NVDA position ahead of earnings season. Data-center demand is the thesis.')

/** Newest first, as the journal lists them. The three story entries are the latest. */
export const JOURNAL_ENTRIES: JournalEntry[] = [
  SPY_BUY,
  NVDA_INSIGHT,
  AAPL_SELL,
  entry(7, 'MARKET_EVENT', null, '2026-06-17T18:30:00Z', null, [TAGS.fed],
    'New Fed chair’s first press conference. Markets slipped through the Q&A, then steadied into the close.'),
  entry(6, 'INSIGHT', 'MSFT', '2026-06-16T14:20:00Z', 512.3, [TAGS.thesis],
    'Cloud growth is the whole reason I own MSFT. If that slows, I should revisit the position, not the headlines.'),
  entry(5, 'REFLECTION', 'NVDA', '2026-06-12T19:10:00Z', 171.2, [TAGS.semis],
    'Up since I bought, but I wrote nothing about valuation. Next time I’ll note what would make me trim.', NVDA_BUY.id),
  entry(4, 'SELL', 'JPM', '2026-06-10T15:05:00Z', 268.15, [TAGS.rebalance],
    'Trimmed JPM to bring financials back under 15% of the portfolio.'),
  entry(3, 'BUY', 'KO', '2026-06-08T17:30:00Z', 71.6, [TAGS.dividends],
    'Added KO for steady dividends. Not expecting much growth here.'),
  NVDA_BUY,
  entry(1, 'MARKET_EVENT', null, '2026-06-02T20:00:00Z', null, [TAGS.fed],
    'Rates held steady. The statement hinted a new Fed chair would take over by summer.'),
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

/* Analyze: SPY around the Jun 18 buy (12 shares, $9,000). Jun 19–21 are closed. */

export const SPY_SHARES = 12

const close = (timestamp: string, price: number): StockHistoryPoint =>
  ({ timestamp, currentPrice: price, open: price, high: price, low: price, prevClose: price })

export const SPY_HISTORY: StockHistoryPoint[] = [
  close('2026-06-15T20:00:00Z', 735),
  close('2026-06-16T20:00:00Z', 731),
  close('2026-06-17T20:00:00Z', 745),
  close(SPY_BUY.timestamp, 750),
  close('2026-06-22T20:00:00Z', 748),
  close('2026-06-23T20:00:00Z', 768),
]

/* Reflect: the scripted filter sequence. `shown` drives the filter bar; `applied` drives the list. */

export type JournalScriptStep = { at: number; shown: JournalFilters; applied: JournalFilters }

function buildJournalScript(): JournalScriptStep[] {
  const steps: JournalScriptStep[] = [{ at: 0, shown: {}, applied: {} }]
  const last = () => steps[steps.length - 1]
  const show = (at: number, update: Partial<JournalFilters>) =>
    steps.push({ at, shown: { ...last().shown, ...update }, applied: last().applied })
  const apply = (at: number) => steps.push({ at, shown: last().shown, applied: last().shown })

  const types: JournalEntryType[] = ['BUY', 'SELL', 'INSIGHT']
  types.forEach((_, i) => show(800 + i * 250, { types: types.slice(0, i + 1) }))
  apply(1700)
  const tagIds = [TAGS.fed.id, TAGS.semis.id, TAGS.rebalance.id]
  tagIds.forEach((_, i) => show(2600 + i * 250, { tagIds: tagIds.slice(0, i + 1) }))
  apply(3500)
  show(4400, { from: '2026-06-18' })
  show(4650, { to: '2026-06-18' })
  apply(5050)
  return steps
}

export const JOURNAL_SCRIPT = buildJournalScript()
export const JOURNAL_TAGS: Tag[] = Object.values(TAGS)
