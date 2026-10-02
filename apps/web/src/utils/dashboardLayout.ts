export const DASHBOARD_METRICS = {
  value: 'Portfolio value',
  'day-change': 'Day’s change',
  'total-pnl': 'Total gain/loss',
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
  metrics: ['value', 'day-change', 'total-pnl'],
  showPerformance: true,
  showJournal: true,
  showBriefing: true,
}

export function resetDashboardLayout(layout: DashboardLayout): DashboardLayout {
  return { ...DEFAULT_DASHBOARD_LAYOUT, metrics: [...DEFAULT_DASHBOARD_LAYOUT.metrics], showBriefing: layout.showBriefing }
}
