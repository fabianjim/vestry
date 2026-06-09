export const SECTOR_COLORS: Record<string, string> = {
  /* ── Premium palette (top sectors / asset classes) ── */
  Technology: '#5e9ed6',
  Equity: '#e5c130',
  'Health Care': '#15d391',
  Finance: '#ba71be',
  'Consumer Discretionary': '#e85838',
  Industrials: '#e69962',
  'Communication Services': '#6eccef',
  'Consumer Staples': '#f8eac4',
  Energy: '#eb7276',
  'Real Estate': '#f7e9f7',

  /* ── Extended palette ── */
  'Basic Materials': '#8fbc8f',
  Materials: '#8fbc8f',
  Telecommunications: '#9b8ec7',
  Utilities: '#87ceeb',
  Miscellaneous: '#b0b0b0',
  Bond: '#b8860b',
  Commodity: '#cd7f32',
  Currency: '#a9a9a9',
  'Multi-Asset': '#c8a2c8',
}

export function getNodeColor(sector: string | null | undefined): string {
  if (!sector) return '#6b7280'
  return SECTOR_COLORS[sector] || '#6b7280'
}
