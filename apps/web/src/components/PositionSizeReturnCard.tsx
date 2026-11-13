import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, usePlotArea, XAxis, YAxis } from 'recharts'
import { portfolioQueries } from '../services/queries'
import { positionSizeReturn, type ValuedHolding } from '../utils/holdingsAnalysis'
import HoldingsCardHeader from './HoldingsCardHeader'
import HoldingTooltip from './HoldingTooltip'
import ItemTooltip from './ItemTooltip'
import { paddedDomain, placeLabels, separateMarkers } from '../utils/scatterLabels'

type Point = ReturnType<typeof positionSizeReturn>['points'][number]
type Domain = [number, number]

// Pixel positions of every marker, with near-identical ones nudged apart. Dots and labels share it.
function useMarkers(points: Point[], x: Domain, y: Domain) {
  const plot = usePlotArea()
  if (!plot) return null
  const markers = separateMarkers(points.map(point => ({
    id: point.ticker,
    x: plot.x + (point.weight - x[0]) / (x[1] - x[0]) * plot.width,
    y: plot.y + plot.height - (point.returnPercent - y[0]) / (y[1] - y[0]) * plot.height,
  })))
  return { plot, markers }
}

function Dot({ points, x, y, payload, cx, cy, fill }: { points: Point[]; x: Domain; y: Domain; payload?: Point; cx?: number; cy?: number; fill?: string }) {
  const marker = useMarkers(points, x, y)?.markers.find(item => item.id === payload?.ticker)
  return <circle cx={marker?.x ?? cx} cy={marker?.y ?? cy} r={4.5} fill={fill} />
}

// Recharts' own labels overlap when positions cluster, so labels are laid out together.
function TickerLabels({ points, x, y }: { points: Point[]; x: Domain; y: Domain }) {
  const layout = useMarkers(points, x, y)
  if (!layout) return null
  const { plot, markers } = layout
  const anchors = markers.map(marker => ({ ...marker, width: marker.id.length * 7 + 2 }))
  const bounds = { left: plot.x, top: plot.y - 20, right: plot.x + plot.width + 28, bottom: plot.y + plot.height }
  const labels = placeLabels(anchors, bounds)
  return <g pointerEvents="none">
    {labels.map((label, index) => <g key={label.id}>
      {label.leader && <line x1={anchors[index].x} y1={anchors[index].y} x2={label.x} y2={label.y}
        stroke="var(--color-border-control)" strokeWidth={1} />}
      <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="central"
        fill="var(--color-secondary)" fontSize={11}>{label.id}</text>
    </g>)}
  </g>
}

export default function PositionSizeReturnCard({ holdings, controls, onHoldingClick }: {
  holdings: ValuedHolding[]; controls?: ReactNode; onHoldingClick: (ticker: string) => void
}) {
  const query = useQuery(portfolioQueries.transactions())
  const { points, missingPrices, missingReturns } = positionSizeReturn(holdings, query.data ?? [])
  // Fit the axes to the data so small positions don't crowd one corner of a 0–100% scale.
  const x = paddedDomain(points.map(point => point.weight), { include: 0, min: 0, max: 100 })
  const y = paddedDomain(points.map(point => point.returnPercent), { include: 0 })
  return <div className="p-4 h-full flex flex-col">
    <HoldingsCardHeader title="Position Size vs. Return" controls={controls} />
    {query.error && <p role="alert" className="text-sm text-error">{query.error.message}</p>}
    {query.isPending ? <p className="text-sm text-muted">Loading position returns…</p> : query.data && <>
      {points.length ? <>
        <p className="text-xs text-secondary mb-1">Unrealized return (%)</p>
        {/* Grows to match a taller neighbouring card; absolute so the chart never props the row open. */}
        <div className="relative flex-1 min-h-64">
          <div className="absolute inset-0"><ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 24, right: 32, bottom: 8, left: 0 }} accessibilityLayer>
              <XAxis type="number" dataKey="weight" name="Portfolio weight" unit="%" domain={x.domain} ticks={x.ticks}
                stroke="var(--color-muted)" fontSize={11} />
              <YAxis type="number" dataKey="returnPercent" name="Unrealized return" unit="%" domain={y.domain} ticks={y.ticks}
                stroke="var(--color-muted)" fontSize={11} width={55} />
              <ReferenceLine y={0} stroke="var(--color-border-control)" strokeDasharray="3 3" />
              <ItemTooltip cursor={{ strokeDasharray: '3 3' }}
                render={({ active, payload }) => {
                  const point = payload?.[0]?.payload as Point | undefined
                  return active && point ? <HoldingTooltip title={point.ticker}
                    lines={[`Weight: ${point.weight.toFixed(1)}%`, `Unrealized return: ${point.returnPercent.toFixed(1)}%`]} /> : null
                }} />
              <Scatter data={points} isAnimationActive={false} cursor="pointer"
                shape={(props: object) => <Dot {...props} points={points} x={x.domain} y={y.domain} />}
                onClick={(point: { payload?: { ticker?: string } }) => {
                  if (point.payload?.ticker) onHoldingClick(point.payload.ticker)
                }}>
                {points.map(point => <Cell key={point.ticker} fill={point.returnPercent > 0 ? 'var(--color-gain)' : point.returnPercent < 0 ? 'var(--color-loss)' : 'var(--color-muted)'} />)}
              </Scatter>
              <TickerLabels points={points} x={x.domain} y={y.domain} />
            </ScatterChart>
          </ResponsiveContainer></div>
        </div>
        <p className="text-center text-xs text-muted mb-3">Current portfolio weight (%)</p>
      </> : <p className="text-sm text-muted">{holdings.length ? 'No positions with both price and cost data available.' : 'No holdings to display.'}</p>}
      {missingPrices > 0 && <p role="status" className="text-sm text-muted mt-3">{missingPrices} holding(s) lack prices. Weights cover priced holdings only.</p>}
      {missingReturns > 0 && <p role="status" className="text-sm text-muted mt-3">{missingReturns} holding(s) lack cost data and are not plotted. Their values remain included in portfolio weights.</p>}
    </>}
  </div>
}
