import { useViewState, type GraphSettings } from '../contexts/ViewState'
import { useEffect, useMemo, useState } from 'react'
import HoldingGraph from '../components/HoldingGraph'
import NodeDetailPanel from '../components/NodeDetailPanel'
import SectorBreakdown from '../components/SectorBreakdown'
import HoldingsValueChart from '../components/HoldingsValueChart'
import { useHoldingGraphData } from '../hooks/useHoldingGraphData'
import HoldingsGrid from '../components/HoldingsGrid'
import { HoldingPnlCard, ReflectionCard } from '../components/HoldingsAnalysisCards'
import ConcentrationCard from '../components/ConcentrationCard'
import PositionSizeReturnCard from '../components/PositionSizeReturnCard'
import HoldingsCardHeader from '../components/HoldingsCardHeader'
import { HOLDINGS_CARDS } from '../utils/holdingsLayout'

const TOGGLES: { key: keyof GraphSettings; label: string }[] = [
  { key: 'groupBySector', label: 'Group by Sector' },
  { key: 'displayWatchlist', label: 'Display Watchlist' },
  { key: 'displayETFs', label: 'Display ETFs' },
]

export default function Analysis() {
  useEffect(() => {
    document.title = 'Holdings'
  }, [])

  const { holdings, isPending, nodes, edges, sectorData, holdingsValueData, error, getMetadata, getTrackingStartDate, getStockSnapshot } =
    useHoldingGraphData()
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)

  const { appliedSettings: [appliedSettings, setAppliedSettings] } = useViewState()

  const { filteredNodes, filteredEdges } = useMemo(() => {
    const filteredNodes = nodes.filter((n) => {
      if (!appliedSettings.displayWatchlist && n.type === 'watchlist') return false
      if (!appliedSettings.displayETFs && n.metadata?.etf) return false
      return true
    })

    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id))
    const filteredEdges = edges.filter(
      (e) => filteredNodeIds.has(e.source as string) && filteredNodeIds.has(e.target as string)
    )

    return { filteredNodes, filteredEdges }
  }, [nodes, edges, appliedSettings])

  const selectedNode = selectedTicker ? nodes.find((n) => n.ticker === selectedTicker) : undefined
  const isWatchlist = selectedNode?.type === 'watchlist'
  const trackingStartDate = selectedTicker ? getTrackingStartDate(selectedTicker) : null
  const selectedSnapshot = selectedTicker ? getStockSnapshot(selectedTicker) : null

  return (
    <div className="max-w-6xl mx-auto mt-4 px-3 mb-8">

      {error && <div className="text-error mb-4">{error}</div>}

      <HoldingsGrid>{([id, size], controls, settings) => {
        if (isPending) return <div className="p-4"><HoldingsCardHeader title={HOLDINGS_CARDS[id].title} controls={controls} />
          <p className="text-sm text-muted">Loading holdings…</p></div>
        switch (id) {
          case 'sector': return <SectorBreakdown data={sectorData} embedded controls={controls} />
          case 'value': return <HoldingsValueChart data={holdingsValueData} embedded controls={controls} />
          case 'concentration': return <ConcentrationCard holdings={holdings} controls={controls} large={size === 2}
            {...settings} onHoldingClick={setSelectedTicker} />
          case 'reflection': return <ReflectionCard holdings={holdings} controls={controls} />
          case 'unrealized': return <HoldingPnlCard holdings={holdings} controls={controls} />
          case 'realized': return <HoldingPnlCard holdings={holdings} realized controls={controls} />
          case 'size-return': return <PositionSizeReturnCard holdings={holdings} controls={controls} onHoldingClick={setSelectedTicker} />
          case 'relationships': return <div className="p-4">
            <HoldingsCardHeader title="Holding Relationships" controls={controls} />
            <div className="mb-4 flex items-center gap-x-6 gap-y-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-muted inline-block"></span>
                <span className="text-sm text-muted">Holding (size = market value)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-muted bg-background inline-block"></span>
                <span className="text-sm text-muted">Watchlist</span>
              </div>

              <div className="ml-auto flex items-center justify-end gap-3 flex-wrap">
                {TOGGLES.map((toggle) => (
                  <label key={toggle.key} className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={appliedSettings[toggle.key]}
                      onChange={(e) =>
                        setAppliedSettings((prev) => ({ ...prev, [toggle.key]: e.target.checked }))
                      }
                      className="rounded border-border-control bg-surface text-primary focus:ring-primary"
                    />
                    {toggle.label}
                  </label>
                ))}
              </div>
            </div>

            {filteredNodes.length ? <HoldingGraph
              nodes={filteredNodes}
              edges={filteredEdges}
              groupBySector={appliedSettings.groupBySector}
              onNodeClick={(ticker) => setSelectedTicker(ticker)}
              width={size === 1 ? 500 : 1000}
              height={size === 1 ? 400 : 550}
              embedded
            /> : <p className="text-sm text-muted py-6">No holdings or watchlist items match these settings.</p>}
          </div>
        }
      }}</HoldingsGrid>

      {selectedTicker && (
        <NodeDetailPanel
          ticker={selectedTicker}
          metadata={getMetadata(selectedTicker)}
          onClose={() => setSelectedTicker(null)}
          isWatchlist={isWatchlist}
          trackingStartDate={trackingStartDate}
          snapshot={selectedSnapshot}
          scope="analysis"
        />
      )}
    </div>
  )
}
