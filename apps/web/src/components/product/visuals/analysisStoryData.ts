import { getHoldingColors, getNodeColor } from '../../../constants/colors'
import type { GraphEdge, GraphNode, HoldingValueItem, SectorBreakdownItem } from '../../../hooks/useHoldingGraphData'
import type { JournalEntry } from '../../../types/journal'
import { concentrationSummary, type ValuedHolding } from '../../../utils/holdingsAnalysis'
import { JOURNAL_ENTRIES } from '../../landing/landingStory'

/*
 * Fixtures for the Analysis story, set on Jun 17, 2026 in Home's story: the investor rereads the May 4
 * AAPL buy ("If it grows past a quarter of my portfolio, I'll trim it back"), finds AAPL above a quarter on
 * Holdings, and writes a reflection. (They trim it the next day, Home's AAPL sell.) Graph and chart data are
 * derived the way useHoldingGraphData derives them, so the real cards render them unchanged.
 */

const AS_OF = '2026-06-17T19:00:00Z'

const meta = (ticker: string, name: string, sector: string, marketCap: number) => ({
  ticker, name, country: 'United States', sector, industry: null, marketCap, marketCapTier: 'Mega', etf: false,
})

const holding = (ticker: string, shares: number, price: number, metadata: ReturnType<typeof meta>): ValuedHolding => ({
  ticker,
  shares,
  metadata,
  stockData: {
    stock: { ticker, timestamp: AS_OF, currentPrice: price, open: price, high: price, low: price, prevClose: price },
    stale: false, staleWarning: null, lastSuccessfulFetch: AS_OF, eod: false,
  },
})

export const HOLDINGS: ValuedHolding[] = [
  holding('AAPL', 85, 231.8, meta('AAPL', 'Apple Inc.', 'Technology', 3.4e12)),
  holding('MSFT', 30, 512.3, meta('MSFT', 'Microsoft Corporation', 'Technology', 3.8e12)),
  holding('NVDA', 90, 178.9, meta('NVDA', 'NVIDIA Corporation', 'Technology', 4.2e12)),
  holding('JPM', 40, 268.15, meta('JPM', 'JP Morgan Chase & Co.', 'Finance', 8.3e11)),
  holding('KO', 120, 71.6, meta('KO', 'Coca-Cola Company (The)', 'Consumer Staples', 3e11)),
]

const value = (h: ValuedHolding) => h.shares * (h.stockData?.stock?.currentPrice ?? 0)
const TOTAL = HOLDINGS.reduce((sum, h) => sum + value(h), 0)
const COLORS = getHoldingColors(HOLDINGS.map((h) => h.ticker))

export const VALUE_DATA: HoldingValueItem[] = HOLDINGS
  .map((h) => ({ ticker: h.ticker, value: value(h), percentage: (value(h) / TOTAL) * 100, color: COLORS.get(h.ticker)!, sector: h.metadata!.sector! }))
  .sort((a, b) => b.value - a.value)

export const SECTOR_DATA: SectorBreakdownItem[] = Object.entries(
  HOLDINGS.reduce<Record<string, number>>((sums, h) => ({ ...sums, [h.metadata!.sector!]: (sums[h.metadata!.sector!] ?? 0) + value(h) }), {}),
)
  .map(([sector, total]) => ({ sector, value: total, percentage: (total / TOTAL) * 100, color: getNodeColor(sector), etf: false }))
  .sort((a, b) => b.value - a.value)

export const GRAPH_NODES: GraphNode[] = HOLDINGS.map((h) => ({
  id: `holding-${h.ticker}`,
  ticker: h.ticker,
  type: 'holding',
  radius: Math.max(10, Math.min(50, 10 + Math.log10(value(h) + 1) * 4)),
  color: getNodeColor(h.metadata?.sector),
  metadata: h.metadata,
}))

export const GRAPH_EDGES: GraphEdge[] = GRAPH_NODES.flatMap((a, i) => GRAPH_NODES.slice(i + 1).flatMap((b) => {
  const shared = (['sector', 'country', 'marketCapTier'] as const).filter((key) => a.metadata?.[key] && a.metadata[key] === b.metadata?.[key]).length
  return shared ? [{ source: a.id, target: b.id, strength: shared }] : []
}))

/** AAPL's share of the portfolio, as Concentration Summary shows it with Top 1. */
export const AAPL_WEIGHT = concentrationSummary(HOLDINGS, 1).topWeight!.toFixed(1)

export const AAPL_BUY = JOURNAL_ENTRIES.find((entry) => entry.id === 11)!
export const AAPL_PLAN = 'If it grows past a quarter of my portfolio, I’ll trim it back.'
export const AAPL_BUY_SHARES = 85

/** What the journal showed on Jun 17: a few of Home's earlier entries, newest first, ending with the AAPL buy. */
export const JOURNAL_LIST: JournalEntry[] = [
  ...JOURNAL_ENTRIES
    .filter((entry) => entry.timestamp < '2026-06-17' && entry.entryType !== 'REFLECTION' && entry.id !== AAPL_BUY.id)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 4),
  AAPL_BUY,
]

export const REFLECTION_TEXT = `AAPL is ${AAPL_WEIGHT}% of my portfolio now, past the quarter I set in May. Time to trim it back, like I planned.`

export const NEW_REFLECTION: JournalEntry = {
  id: 100,
  entryType: 'REFLECTION',
  ticker: 'AAPL',
  timestamp: '2026-06-17T19:10:00Z',
  priceSnapshot: 231.8,
  tags: AAPL_BUY.tags,
  body: REFLECTION_TEXT,
  sourceEntryId: AAPL_BUY.id,
}
