import GlassSelect from './GlassSelect'
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

export default function DashboardSummary({ metrics, holdings, pnl, ready, onMetricChange, disabled }: {
  metrics: DashboardLayout['metrics']; holdings: ValuedHolding[]; pnl?: PnLSummary; ready: boolean
  onMetricChange: (index: number, metric: DashboardLayout['metrics'][number]) => void; disabled: boolean
}) {
  const values = dashboardMetrics(holdings, pnl, ready)
  return <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
    {metrics.map((id, index) => {
      const metric = values[id]
      const color = metric.format !== 'change' || metric.value == null || metric.value === 0 ? 'text-foreground'
        : metric.value > 0 ? 'text-gain-emphasis' : 'text-loss-emphasis'
      return <div key={index} className="p-4 bg-surface rounded-lg border border-border">
        <div className="flex items-center gap-1 text-sm text-muted [&_button:disabled]:opacity-100">
          <GlassSelect label={`Choose ${['left', 'middle', 'right'][index]} summary metric`} value={id} disabled={disabled}
            onChange={value => onMetricChange(index, value)}
            options={(Object.keys(DASHBOARD_METRICS) as Array<DashboardLayout['metrics'][number]>).map(value => ({
              value, label: DASHBOARD_METRICS[value], disabled: value !== id && metrics.includes(value),
            }))} />
          {metric.detail && <span> {metric.detail}</span>}
        </div>
        <div className={`text-2xl font-130 tabular-nums ${color}`}>{display(metric)}</div>
      </div>
    })}
  </div>
}
