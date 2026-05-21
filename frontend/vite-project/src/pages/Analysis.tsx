import { useState } from 'react'
import HoldingGraph from '../components/HoldingGraph'
import NodeDetailPanel from '../components/NodeDetailPanel'
import SectorBreakdown from '../components/SectorBreakdown'
import HoldingsValueChart from '../components/HoldingsValueChart'
import { useHoldingGraphData } from '../hooks/useHoldingGraphData'

export default function Analysis() {
  const { nodes, edges, sectorData, holdingsValueData, error, getMetadata } = useHoldingGraphData()
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)

  return (
    <div className="max-w-6xl mx-auto mt-6 px-3">
      <h2 className="text-2xl font-150 mb-6">Holding Analysis</h2>

      {error && <div className="text-error mb-4">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <SectorBreakdown data={sectorData} />
        <HoldingsValueChart data={holdingsValueData} />
      </div>

      <div className="mb-4 flex gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-muted inline-block"></span>
          <span className="text-sm text-muted">Holding (size = market value)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full border-2 border-muted bg-background inline-block"></span>
          <span className="text-sm text-muted">Watchlist</span>
        </div>
      </div>

      <HoldingGraph
        nodes={nodes}
        edges={edges}
        onNodeClick={(ticker) => setSelectedTicker(ticker)}
        width={1000}
        height={550}
      />

      {selectedTicker && (
        <NodeDetailPanel
          ticker={selectedTicker}
          metadata={getMetadata(selectedTicker)}
          onClose={() => setSelectedTicker(null)}
        />
      )}
    </div>
  )
}
