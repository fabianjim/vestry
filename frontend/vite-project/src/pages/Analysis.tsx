import { useMemo, useState } from 'react'
import HoldingGraph from '../components/HoldingGraph'
import NodeDetailPanel from '../components/NodeDetailPanel'
import SectorBreakdown from '../components/SectorBreakdown'
import HoldingsValueChart from '../components/HoldingsValueChart'
import { useHoldingGraphData } from '../hooks/useHoldingGraphData'

type GraphSettings = {
  groupBySector: boolean
  displayWatchlist: boolean
  displayETFs: boolean
}

const DEFAULT_SETTINGS: GraphSettings = {
  groupBySector: true,
  displayWatchlist: true,
  displayETFs: true,
}

const TOGGLES: { key: keyof GraphSettings; label: string }[] = [
  { key: 'groupBySector', label: 'Group by Sector' },
  { key: 'displayWatchlist', label: 'Display Watchlist' },
  { key: 'displayETFs', label: 'Display ETFs' },
]

export default function Analysis() {
  const { nodes, edges, sectorData, holdingsValueData, error, getMetadata, getTrackingStartDate, getStockSnapshot } =
    useHoldingGraphData()
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)

  const [pendingSettings, setPendingSettings] = useState<GraphSettings>(DEFAULT_SETTINGS)
  const [appliedSettings, setAppliedSettings] = useState<GraphSettings>(DEFAULT_SETTINGS)

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
    <div className="max-w-6xl mx-auto mt-6 px-3 mb-8">
      <h2 className="text-2xl font-150 mb-6">Holding Analysis</h2>

      {error && <div className="text-error mb-4">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <SectorBreakdown data={sectorData} />
        <HoldingsValueChart data={holdingsValueData} />
      </div>

      <div className="mb-4 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-muted inline-block"></span>
          <span className="text-sm text-muted">Holding (size = market value)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full border-2 border-muted bg-background inline-block"></span>
          <span className="text-sm text-muted">Watchlist</span>
        </div>

        <div className="flex items-center gap-4 ml-auto">
          {TOGGLES.map((toggle) => (
            <label key={toggle.key} className="flex items-center gap-2 text-sm text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={pendingSettings[toggle.key]}
                onChange={(e) =>
                  setPendingSettings((prev) => ({ ...prev, [toggle.key]: e.target.checked }))
                }
                className="rounded border-border bg-surface text-primary focus:ring-primary"
              />
              {toggle.label}
            </label>
          ))}
          <button
            onClick={() => setAppliedSettings(pendingSettings)}
            className="px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary-hover transition-colors"
          >
            Apply
          </button>
        </div>
      </div>

      <HoldingGraph
        nodes={filteredNodes}
        edges={filteredEdges}
        groupBySector={appliedSettings.groupBySector}
        onNodeClick={(ticker) => setSelectedTicker(ticker)}
        width={1000}
        height={550}
      />

      {selectedTicker && (
        <NodeDetailPanel
          ticker={selectedTicker}
          metadata={getMetadata(selectedTicker)}
          onClose={() => setSelectedTicker(null)}
          isWatchlist={isWatchlist}
          trackingStartDate={trackingStartDate}
          snapshot={selectedSnapshot}
        />
      )}
    </div>
  )
}
