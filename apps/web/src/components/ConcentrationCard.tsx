import type { ReactNode } from 'react'
import { Area, AreaChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { concentrationSummary, type ValuedHolding } from '../utils/holdingsAnalysis'
import { formatCompactCurrency } from '../utils/formatUtils'
import HoldingsCardHeader from './HoldingsCardHeader'
import type { ConcentrationSettings } from './HoldingsGrid'

const percent = (value: number | null) => value == null ? '—' : `${value.toFixed(1)}%`

export default function ConcentrationCard({ holdings, controls, large, topN, onTopNChange, disabled, onHoldingClick }: ConcentrationSettings & {
  holdings: ValuedHolding[]; controls?: ReactNode; large: boolean; onHoldingClick: (ticker: string) => void
}) {
  const summary = concentrationSummary(holdings, topN)
  const { rows, largest, effectiveHoldings } = summary
  return <div className="p-4">
    <HoldingsCardHeader title="Concentration Summary" controls={controls} />
    {!holdings.length ? <p className="text-sm text-muted">No holdings to display.</p> : !rows.length ?
      <p className="text-sm text-muted">Prices are unavailable. Concentration cannot be calculated.</p> : <>
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <label className="flex items-center gap-1.5 text-sm text-secondary">
            Top
            <select aria-label="Number of top holdings" value={summary.topN} disabled={disabled}
              className="rounded border border-border-control bg-surface px-2 py-1 text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
              onChange={event => onTopNChange(Number(event.target.value))}>
              {rows.map(row => <option key={row.rank} value={row.rank}>{row.rank}</option>)}
            </select>
            {summary.topN === 1 ? 'holding' : 'holdings'}
          </label>
          <p className="mt-2 text-3xl font-130 text-primary tabular-nums" aria-live="polite">{percent(summary.topWeight)}</p>
        </div>
        <p className="text-sm text-secondary tabular-nums">{formatCompactCurrency(summary.topValue!)}</p>
      </div>
      <div className="h-44" aria-label="Cumulative portfolio weight, ranked by holding size">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 10, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
            <XAxis dataKey="rank" interval={0} stroke="var(--color-muted)" tickLine={false} fontSize={11} />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} width={40} tickFormatter={value => `${value}%`}
              stroke="var(--color-muted)" axisLine={false} tickLine={false} fontSize={11} />
            <ReferenceArea x1={1} x2={summary.topN} fill="var(--color-primary)" fillOpacity={0.08} />
            <ReferenceLine x={summary.topN} stroke="var(--color-primary)" strokeDasharray="3 3" />
            <Tooltip formatter={(value: number) => [percent(value), 'Combined weight']}
              labelFormatter={label => `Top ${label} holding${label === 1 ? '' : 's'}`}
              contentStyle={{ backgroundColor: 'var(--color-elevated)', border: '1px solid var(--color-border)', borderRadius: 6 }}
              labelStyle={{ color: 'var(--color-foreground)' }} itemStyle={{ color: 'var(--color-foreground)' }} />
            <Area type="linear" dataKey="cumulativeWeight" stroke="var(--color-primary)" fill="var(--color-primary)"
              fillOpacity={0.08} isAnimationActive={false} activeDot={false}
              dot={({ cx, cy, payload }) => <circle key={payload.rank} cx={cx} cy={cy} r={payload.rank === summary.topN ? 6 : 4}
                fill="var(--color-primary)" stroke="var(--color-surface)" strokeWidth={2}
                role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled}
                aria-label={`Select top ${payload.rank} holdings: ${percent(payload.cumulativeWeight)}`}
                className="cursor-pointer focus-visible:stroke-foreground focus-visible:stroke-4"
                onClick={() => { if (!disabled) onTopNChange(payload.rank) }}
                onKeyDown={event => {
                  if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault(); onTopNChange(payload.rank)
                  }
                }} />} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-center text-xs text-muted mb-4">Holdings, largest first</p>
      <div className="grid grid-cols-2 gap-3 border-y border-border py-3 mb-3">
        <div>
          <p className="text-xs text-muted mb-1">Largest position</p>
          <button className="text-sm font-130 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary rounded"
            onClick={() => onHoldingClick(largest!.ticker)}>{largest!.ticker} · {percent(largest!.weight)}</button>
        </div>
        <div>
          <p className="text-xs text-muted mb-1">Effective holdings</p>
          <p className="text-lg font-130 tabular-nums">{effectiveHoldings!.toFixed(1)}</p>
        </div>
      </div>
      <p className="text-xs text-muted mb-3">The same weight concentration as {effectiveHoldings!.toFixed(1)} equally sized positions. Does not measure correlations or holdings inside funds.</p>
      <div className={`${large ? 'max-h-56' : 'max-h-36'} overflow-y-auto divide-y divide-border`}>
        {(large ? rows : rows.slice(0, summary.topN)).map(row => <button key={row.ticker}
          className="flex w-full items-center gap-3 rounded px-1 py-2 text-sm text-left hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          onClick={() => onHoldingClick(row.ticker)}>
          <span className={`h-1.5 w-1.5 rounded-full ${row.rank <= summary.topN ? 'bg-primary' : 'bg-muted'}`} />
          <span className="font-130">{row.ticker}</span>
          {large && <span className="ml-auto text-secondary tabular-nums">{formatCompactCurrency(row.value)}</span>}
          <span className={`${large ? '' : 'ml-auto'} text-secondary tabular-nums`}>{percent(row.weight)}</span>
        </button>)}
      </div>
      {summary.missing > 0 && <p role="status" className="text-sm text-muted mt-3">{summary.missing} holding(s) lack prices. Weights cover priced holdings only.</p>}
    </>}
  </div>
}
