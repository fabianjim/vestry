// Menu order: the default three, left to right, then the rest.
export const DASHBOARD_METRICS = {
  'day-change': 'Day’s change',
  'total-pnl': 'Total gain/loss',
  'since-last-trade': 'Since last trade',
  value: 'Portfolio value',
  'unrealized-pnl': 'Unrealized gain/loss',
  'realized-pnl': 'Realized gain/loss',
  'holding-count': 'Number of holdings',
  'largest-weight': 'Largest holding weight',
} as const

export type DashboardMetric = keyof typeof DASHBOARD_METRICS
export type DashboardLayout = {
  v: 1
  metrics: [DashboardMetric, DashboardMetric, DashboardMetric]
  showPerformance: boolean
  showJournal: boolean
  showBriefing: boolean
}

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  v: 1,
  metrics: ['day-change', 'total-pnl', 'since-last-trade'],
  showPerformance: true,
  showJournal: true,
  showBriefing: true,
}
