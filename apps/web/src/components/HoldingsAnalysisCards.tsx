import { useState, type ReactNode } from 'react'
import HoldingsCardHeader from './HoldingsCardHeader'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { journalQueries, portfolioQueries } from '../services/queries'
import { holdingPnl, reflectionOverview, type ValuedHolding } from '../utils/holdingsAnalysis'
import { formatDateTime } from '../utils/dateUtils'
import { formatCompactCurrency, formatSignedCurrency } from '../utils/formatUtils'

const percent = (value: number | null) => value == null ? '—' : `${value.toFixed(1)}%`

export function ReflectionCard({ holdings, controls }: { holdings: ValuedHolding[]; controls?: ReactNode }) {
  const query = useQuery(journalQueries.entries())
  const rows = reflectionOverview(holdings, query.data ?? [])
  return (
    <div className="p-4">
      <HoldingsCardHeader title="Reflection Overview" controls={controls} />
      {query.error && <p role="alert" className="text-error text-sm">{query.error.message}</p>}
      {query.isPending ? <p className="text-sm text-muted">Loading reflections…</p> : query.data && (
        rows.length ? <ul className="max-h-80 overflow-y-auto divide-y divide-border">
          {rows.map(({ ticker, entry }) => {
            const days = entry ? Math.max(0, Math.floor((Date.now() - new Date(entry.timestamp).getTime()) / 86_400_000)) : null
            return (
              <li key={ticker} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="font-130">{ticker}</span>
                <span className="text-secondary text-right" title={entry ? formatDateTime(entry.timestamp) : undefined}>
                  {days === null ? 'No reflection yet' : days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'} ago`}
                </span>
              </li>
            )
          })}
        </ul> : <p className="text-sm text-muted">No holdings to review.</p>
      )}
      <Link to="/journal" className="inline-block mt-4 text-sm text-primary hover:underline">Open journal</Link>
    </div>
  )
}

export function HoldingPnlCard({ holdings, realized = false, controls }: { holdings: ValuedHolding[]; realized?: boolean; controls?: ReactNode }) {
  const query = useQuery(portfolioQueries.transactions())
  const [showPercent, setShowPercent] = useState(false)
  const rows = holdingPnl(holdings, query.data ?? [], realized)
  const known = rows.filter(row => row.value !== null)
  const missing = rows.length - known.length
  const total = known.reduce((sum, row) => sum + (row.value ?? 0), 0)
  const formatValue = (value: number) => showPercent ? percent(value) : formatSignedCurrency(value)

  return (
    <div className="p-4">
      <HoldingsCardHeader title={`${realized ? 'Realized' : 'Unrealized'} Gain/Loss`} controls={controls}>
        <button className="text-sm px-2 py-1 rounded hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary"
          onClick={() => setShowPercent(value => !value)} aria-label="Show percentages" aria-pressed={showPercent}>
          {showPercent ? '%' : '$'}
        </button>
      </HoldingsCardHeader>
      {query.error && <p role="alert" className="text-error text-sm">{query.error.message}</p>}
      {query.isPending ? <p className="text-sm text-muted">Loading gain/loss…</p> : query.data && <>
        {known.length > 0 && <>
          <p className="text-sm text-secondary mb-3">{missing ? 'Known subtotal' : 'Net gain/loss'}{' '}
            <span className={total > 0 ? 'text-gain' : total < 0 ? 'text-loss' : 'text-foreground'}>{formatSignedCurrency(total)}</span>
          </p>
          <div className="max-h-80 overflow-y-auto">
            <div style={{ height: Math.max(160, known.length * 38) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={known} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 0 }} accessibilityLayer>
                  <XAxis type="number" tickFormatter={value => showPercent ? `${value}%` : formatCompactCurrency(value)}
                    stroke="var(--color-muted)" fontSize={11} />
                  <YAxis type="category" dataKey="ticker" width={65} stroke="var(--color-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                  <ReferenceLine x={0} stroke="var(--color-border-control)" />
                  <Tooltip formatter={(value: number) => [formatValue(value), 'Gain/loss']}
                    cursor={{ fill: 'var(--color-surface-hover)' }}
                    contentStyle={{ backgroundColor: 'var(--color-elevated)', border: '1px solid var(--color-border)', borderRadius: 6 }}
                    labelStyle={{ color: 'var(--color-foreground)' }} itemStyle={{ color: 'var(--color-foreground)' }} />
                  <Bar dataKey={showPercent ? 'percent' : 'value'} barSize={18}>
                    {known.map(row => <Cell key={row.ticker} fill={row.value! > 0 ? 'var(--color-gain)' : row.value! < 0 ? 'var(--color-loss)' : 'var(--color-muted)'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>}
        {!rows.length && <p className="text-sm text-muted">{realized ? 'No recorded sales yet.' : 'No holdings to display.'}</p>}
        {missing > 0 && <p role="status" className="text-sm text-muted mt-3">
          Unavailable: {rows.filter(row => row.value === null).map(row => row.ticker).join(', ')}. Missing price or transaction history.
        </p>}
      </>}
    </div>
  )
}
