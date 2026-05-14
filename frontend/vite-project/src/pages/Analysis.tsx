import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import HoldingGraph from '../components/HoldingGraph'
import NodeDetailPanel from '../components/NodeDetailPanel'
import { useHoldingGraphData } from '../hooks/useHoldingGraphData'

export default function Analysis() {
  const navigate = useNavigate()
  const { nodes, edges, error, getMetadata } = useHoldingGraphData()
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)

  return (
    <div className="max-w-6xl mx-auto mt-6 px-3">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-150 m-0">Holding Analysis</h2>
        <button onClick={() => navigate('/dashboard')} className="px-3 py-2 bg-surface border border-border rounded-md hover:bg-surface-hover transition-colors">← Back to Dashboard</button>
      </div>

      {error && <div className="text-error mb-4">{error}</div>}

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
