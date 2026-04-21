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
  const onNodeClickRef = useRef(onNodeClick)
  const simulationRef = useRef<d3.Simulation<GraphNode, undefined> | null>(null)
  const isFirstRender = useRef(true)
  const prevNodeIds = useRef('')
  const prevEdgeIds = useRef('')

  // Keep callback ref up to date without restarting simulation
  useEffect(() => {
    onNodeClickRef.current = onNodeClick
  }, [onNodeClick])

  // Single effect handles both initial setup and data updates
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    const nodeIds = nodes.map((n) => n.id).join(',')
    const edgeIds = edges.map((e) => `${e.source}-${e.target}`).join(',')

    if (!isFirstRender.current) {
      // Skip entirely if data hasn't actually changed
      if (nodeIds === prevNodeIds.current && edgeIds === prevEdgeIds.current) {
        return
      }
    }

    prevNodeIds.current = nodeIds
    prevEdgeIds.current = edgeIds

    const svg = d3.select(svgRef.current)

    if (isFirstRender.current) {
      // === FIRST MOUNT: Create everything from scratch ===
      svg.selectAll('*').remove()

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

      simulationRef.current = simulation

      // Edge lines
      const link = g
        .append('g')
        .attr('stroke', 'rgba(255,255,255,0.15)')
        .attr('stroke-opacity', 0.6)
        .selectAll('line')
        .data(edges)
        .join('line')
        .attr('stroke-width', (d) => Math.max(1, d.strength * 1.5))

      const tooltip = g
        .append('g')
        .attr('class', 'tooltip')
        .style('display', 'none')
        .style('pointer-events', 'none')

      tooltip.append('rect')
        .attr('fill', '#32393d')
        .attr('stroke', 'rgba(255,255,255,0.08)')
        .attr('rx', 4)

      // Node groups
      const node = g
        .append('g')
        .selectAll('g')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .data(nodes, (d: any) => d.id)
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
          onNodeClickRef.current(d.ticker)
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
              .attr('fill', '#bdbdbd')
              .text(line)
          })

          const maxWidth = Math.max(...lines.map((l) => l.length)) * 6 + 12
          tooltip.select('rect').attr('width', maxWidth).attr('height', lines.length * 14 + 8)
        })
        .on('mouseleave', () => {
          tooltip.style('display', 'none')
        })

      // Circles
      node
        .append('circle')
        .attr('r', (d) => d.radius)
        .attr('fill', (d) => (d.type === 'holding' ? d.color : '#2d2d2d'))
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
        .attr('fill', '#bdbdbd')
        .attr('pointer-events', 'none')

      simulation.on('tick', () => {
        link
          .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
          .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
          .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
          .attr('y2', (d) => (d.target as GraphNode).y ?? 0)

        node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
      })

      simulation.alpha(1).restart()
      isFirstRender.current = false

      return () => {
        simulation.stop()
        simulationRef.current = null
        isFirstRender.current = true
      }
    }

    // SUBSEQUENT RENDERS: Data changed, update in place
    const simulation = simulationRef.current
    if (!simulation) return

    const g = svg.select<SVGGElement>('g')
    if (g.empty()) return

    // Update links
    const link = g
      .selectAll<SVGLineElement, GraphEdge>('line')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .data(edges, (d: any) => `${d.source}-${d.target}`)
    link.exit().remove()
    const linkEnter = link.enter().append('line').attr('stroke-width', (d) => Math.max(1, d.strength * 1.5))
    const linkMerged = linkEnter.merge(link)
    linkMerged.attr('stroke-width', (d) => Math.max(1, d.strength * 1.5))

    // Update force link data
    const linkForce = simulation.force<d3.ForceLink<GraphNode, GraphEdge>>('link')
    if (linkForce) {
      linkForce.links(edges)
    }

    // Update nodes
    const tooltip = g.select<SVGGElement>('.tooltip')

    const node = g
      .selectAll<SVGGElement, GraphNode>('g:not(.tooltip)')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .data(nodes, (d: any) => d.id)
    node.exit().remove()

    const nodeEnter = node
      .enter()
      .append('g')
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
        onNodeClickRef.current(d.ticker)
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
            .attr('fill', '#bdbdbd')
            .text(line)
        })

        const maxWidth = Math.max(...lines.map((l) => l.length)) * 6 + 12
        tooltip.select('rect').attr('width', maxWidth).attr('height', lines.length * 14 + 8)
      })
      .on('mouseleave', () => {
        tooltip.style('display', 'none')
      })

    nodeEnter
      .append('circle')
      .attr('r', (d) => d.radius)
      .attr('fill', (d) => (d.type === 'holding' ? d.color : '#2d2d2d'))
      .attr('stroke', (d) => d.color)
      .attr('stroke-width', (d) => (d.type === 'watchlist' ? 3 : 0))

    nodeEnter
      .append('text')
      .text((d) => d.ticker)
      .attr('x', 0)
      .attr('y', (d) => d.radius + 14)
      .attr('text-anchor', 'middle')
      .attr('font-size', 12)
      .attr('font-weight', 'bold')
      .attr('fill', '#bdbdbd')
      .attr('pointer-events', 'none')

    const nodeMerged = nodeEnter.merge(node)

    // Update tick handler to use merged selections
    simulation.on('tick', () => {
      linkMerged
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0)

      nodeMerged.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    // Update simulation nodes and warm-restart
    simulation.nodes(nodes)
    simulation.alpha(0.1).restart()
  }, [nodes, edges, width, height])

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="w-full h-auto border border-border rounded-lg bg-surface"
      style={{ aspectRatio: `${width} / ${height}` }}
    />
  )
}
