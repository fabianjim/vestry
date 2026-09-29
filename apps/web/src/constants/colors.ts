export const SECTOR_COLORS: Record<string, string> = {
  /* Data palette: independent of UI accents, journal types and financial outcomes.
     Keep category identities consistent across graph nodes, charts and detail lines. */
  Technology: '#60a5fa',
  Equity: '#facc15',
  'Health Care': '#34d399',
  Finance: '#a78bfa',
  'Consumer Discretionary': '#dc4446',
  Industrials: '#fb923c',
  'Communication Services': '#22d3ee',
  'Consumer Staples': '#a3e635',
  Energy: '#fb7185',
  'Real Estate': '#e879f9',

  /* ── Compatibility keys and additional asset classes ── */
  'Basic Materials': '#4ade80',
  Materials: '#4ade80',
  Telecommunications: '#22d3ee',
  Utilities: '#38bdf8',
  Miscellaneous: '#a0a3aa',
  Bond: '#818cf8',
  Commodity: '#eab068',
  Currency: '#2dd4bf',
  'Multi-Asset': '#c084fc',
}

export function getNodeColor(sector: string | null | undefined): string {
  if (!sector) return '#a0a3aa'
  return SECTOR_COLORS[sector] || '#a0a3aa'
}

const HOLDING_COLORS = [...new Set(Object.values(SECTOR_COLORS))]

/** Keep ticker colors independent of sector and value ranking. */
export function getHoldingColors(tickers: string[]): Map<string, string> {
  return new Map([...new Set(tickers)].sort().map((ticker, index) => [
    ticker,
    HOLDING_COLORS[index] ?? `hsl(${((index - HOLDING_COLORS.length) * 137.508) % 360} 60% 65%)`,
  ]))
}
