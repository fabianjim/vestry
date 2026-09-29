import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Cell, LabelList, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { portfolioQueries } from '../services/queries'
import { positionSizeReturn, type ValuedHolding } from '../utils/holdingsAnalysis'
import HoldingsCardHeader from './HoldingsCardHeader'

export default function PositionSizeReturnCard({ holdings, controls, onHoldingClick }: {
  holdings: ValuedHolding[]; controls?: ReactNode; onHoldingClick: (ticker: string) => void
}) {
  const query = useQuery(portfolioQueries.transactions())
  const { points, missingPrices, missingReturns } = positionSizeReturn(holdings, query.data ?? [])
  return <div className="p-4">
    <HoldingsCardHeader title="Position Size vs. Return" controls={controls} />
    <p className="text-xs text-muted mb-4">Current portfolio weight against unrealized return on remaining average cost.</p>
    {query.error && <p role="alert" className="text-sm text-error">{query.error.message}</p>}
    {query.isPending ? <p className="text-sm text-muted">Loading position returns…</p> : query.data && <>
      {points.length ? <>
        <p className="text-xs text-secondary mb-1">Unrealized return (%)</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 24, right: 32, bottom: 8, left: 0 }} accessibilityLayer>
              <XAxis type="number" dataKey="weight" name="Portfolio weight" unit="%" domain={[0, 100]}
                tickFormatter={value => `${value}%`} stroke="var(--color-muted)" fontSize={11} />
              <YAxis type="number" dataKey="returnPercent" name="Unrealized return" unit="%" domain={['auto', 'auto']}
                tickFormatter={value => `${value}%`} stroke="var(--color-muted)" fontSize={11} width={55} />
              <ReferenceLine y={0} ifOverflow="extendDomain" stroke="var(--color-border-control)" strokeDasharray="3 3" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  const point = payload?.[0]?.payload as typeof points[number] | undefined
                  return active && point ? <div className="rounded border border-border bg-elevated p-3 text-sm shadow-floating">
                    <p className="font-130 mb-1">{point.ticker}</p>
                    <p className="text-secondary">Weight: {point.weight.toFixed(1)}%</p>
                    <p className="text-secondary">Unrealized return: {point.returnPercent.toFixed(1)}%</p>
                  </div> : null
                }} />
              <Scatter data={points} isAnimationActive={false} cursor="pointer"
                onClick={(point: { payload?: { ticker?: string } }) => {
                  if (point.payload?.ticker) onHoldingClick(point.payload.ticker)
                }}>
                {points.map(point => <Cell key={point.ticker} fill={point.returnPercent > 0 ? 'var(--color-gain)' : point.returnPercent < 0 ? 'var(--color-loss)' : 'var(--color-muted)'} />)}
                <LabelList dataKey="ticker" position="top" fill="var(--color-secondary)" fontSize={11} />
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <p className="text-center text-xs text-muted mb-3">Current portfolio weight (%)</p>
      </> : <p className="text-sm text-muted">{holdings.length ? 'No positions with both price and cost data available.' : 'No holdings to display.'}</p>}
      {missingPrices > 0 && <p role="status" className="text-sm text-muted mt-3">{missingPrices} holding(s) lack prices. Weights cover priced holdings only.</p>}
      {missingReturns > 0 && <p role="status" className="text-sm text-muted mt-3">{missingReturns} holding(s) lack cost data and are not plotted. Their values remain included in portfolio weights.</p>}
    </>}
  </div>
}
