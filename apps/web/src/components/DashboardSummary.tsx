import type { PnLSummary } from '../types/transaction'
import { DASHBOARD_METRICS, type DashboardLayout } from '../utils/dashboardLayout'
import { dashboardMetrics, type SummaryMetric } from '../utils/dashboardMetrics'
import type { ValuedHolding } from '../utils/holdingsAnalysis'
import { formatCurrency, formatSignedCurrencyWithPercent } from '../utils/formatUtils'

function display(metric: SummaryMetric) {
  if (metric.value == null) return '—'
  if (metric.format === 'money') return formatCurrency(metric.value)
  if (metric.format === 'change') return formatSignedCurrencyWithPercent(metric.value, metric.percent!)
  if (metric.format === 'percent') return `${metric.value.toFixed(1)}%`
  return String(metric.value)
}

export default function DashboardSummary({ metrics, holdings, pnl, ready }: {
  metrics: DashboardLayout['metrics']; holdings: ValuedHolding[]; pnl?: PnLSummary; ready: boolean
}) {
  const values = dashboardMetrics(holdings, pnl, ready)
  return <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
    {metrics.map(id => {
      const metric = values[id]
      const color = metric.format !== 'change' || metric.value == null || metric.value === 0 ? 'text-foreground'
        : metric.value > 0 ? 'text-gain-emphasis' : 'text-loss-emphasis'
      return <div key={id} className="p-4 bg-surface rounded-lg border border-border">
        <div className="text-sm text-muted">{DASHBOARD_METRICS[id]}{metric.detail && ` · ${metric.detail}`}</div>
        <div className={`text-2xl font-130 tabular-nums ${color}`}>{display(metric)}</div>
      </div>
    })}
  </div>
}
