import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

export type GraphNode = d3.SimulationNodeDatum & {
  id: string
  ticker: string
  type: 'holding' | 'watchlist'
  radius: number
  color: string
  metadata?: {
    sector?: string | null
    country?: string | null
    marketCapTier?: string | null
  } | null
}

export type GraphEdge = d3.SimulationLinkDatum<GraphNode> & {
  strength: number
}

type HoldingGraphProps = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onNodeClick: (ticker: string) => void
  width?: number
  height?: number
}

export default function HoldingGraph({
  nodes,
  edges,
  onNodeClick,
  width = 800,
  height = 500,
}: HoldingGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Zoom group
    const g = svg.append('g')

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString())
      })

    svg.call(zoom)

    const simulation = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<GraphNode, GraphEdge>(edges)
          .id((d) => d.id)
          .distance(120)
          .strength((d) => d.strength * 0.5)
      )
      .force('charge', d3.forceManyBody<GraphNode>().strength(-300))
      .force('center', d3.forceCenter<GraphNode>(width / 2, height / 2))
      .force('collision', d3.forceCollide<GraphNode>().radius((d) => d.radius + 4))

    // Edge lines
    const link = g
      .append('g')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .selectAll('line')
      .data(edges)
      .join('line')
      .attr('stroke-width', (d) => Math.max(1, d.strength * 1.5))

    // Hover tooltip
    const tooltip = g
      .append('g')
      .attr('class', 'tooltip')
      .style('display', 'none')
      .style('pointer-events', 'none')

    tooltip.append('rect').attr('fill', 'white').attr('stroke', '#ccc').attr('rx', 4)

    // Node groups
    const node = g
      .append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'pointer')
      .call(
        d3
          .drag<Element, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x ?? null
            d.fy = d.y ?? null
          })
          .on('drag', (event, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any
      )
      .on('click', (_event, d) => {
        onNodeClick(d.ticker)
      })
      .on('mouseenter', (_event, d) => {
        if (d.x == null || d.y == null) return
        const lines = [
          d.ticker,
          d.metadata?.sector || 'Sector: -',
          d.metadata?.country || 'Country: -',
          d.metadata?.marketCapTier || 'Cap: -',
        ]
        tooltip.style('display', 'block')
        tooltip.attr('transform', `translate(${d.x + d.radius + 8},${d.y - 40})`)

        tooltip.selectAll('text').remove()
        lines.forEach((line, i) => {
          tooltip
            .append('text')
            .attr('x', 6)
            .attr('y', 6 + i * 14)
            .attr('font-size', 11)
            .attr('fill', '#333')
            .text(line)
        })

        const maxWidth = Math.max(...lines.map((l) => l.length)) * 6 + 12
        tooltip
          .select('rect')
          .attr('width', maxWidth)
          .attr('height', lines.length * 14 + 8)
      })
      .on('mouseleave', () => {
        tooltip.style('display', 'none')
      })

    // Circles
    node
      .append('circle')
      .attr('r', (d) => d.radius)
      .attr('fill', (d) => (d.type === 'holding' ? d.color : 'white'))
      .attr('stroke', (d) => d.color)
      .attr('stroke-width', (d) => (d.type === 'watchlist' ? 3 : 0))

    // Labels
    node
      .append('text')
      .text((d) => d.ticker)
      .attr('x', 0)
      .attr('y', (d) => d.radius + 14)
      .attr('text-anchor', 'middle')
      .attr('font-size', 12)
      .attr('font-weight', 'bold')
      .attr('fill', '#333')
      .attr('pointer-events', 'none')

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0)

      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    return () => {
      simulation.stop()
    }
  }, [nodes, edges, width, height, onNodeClick])

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{
        border: '1px solid #dee2e6',
        borderRadius: 8,
        backgroundColor: '#fafafa',
        width: '100%',
        height: 'auto',
        aspectRatio: `${width} / ${height}`,
      }}
    />
  )
}
