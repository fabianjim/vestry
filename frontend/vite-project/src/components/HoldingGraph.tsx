import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

function getSectorKey(node: GraphNode): string {
  return node.metadata?.sector || 'Unknown'
}

function computeSectorStartPositions(
  nodes: GraphNode[],
  width: number,
  height: number
): Map<string, { x: number; y: number }> {
  const sectors = Array.from(new Set(nodes.map(getSectorKey)))
  const centerX = width / 2
  const centerY = height / 2
  const radius = Math.min(width, height) * 0.22
  const map = new Map<string, { x: number; y: number }>()
  sectors.forEach((sector, i) => {
    const angle = (2 * Math.PI * i) / Math.max(sectors.length, 1)
    map.set(sector, {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    })
  })
  return map
}

function scatterFromCenter(
  nodes: GraphNode[],
  centerX: number,
  centerY: number
) {
  nodes.forEach((n) => {
    n.x = centerX + (Math.random() - 0.5) * 900
    n.y = centerY + (Math.random() - 0.5) * 600
  })
}

function createSectorGroupingForce(
  width: number,
  height: number,
  getGroupBySector: () => boolean
): d3.Force<GraphNode, undefined> {
  let nodes: GraphNode[] = []
  let centers = new Map<string, { x: number; y: number }>()
  let centersInitialized = false

  function force(alpha: number) {
    if (!getGroupBySector() || alpha < 0.1) return
    if (!centersInitialized) {
      centers = computeSectorStartPositions(nodes, width, height)
      centersInitialized = true
    }
    const strength = 0.015 * alpha
    for (const d of nodes) {
      if (d.fx != null || d.fy != null) continue
      const center = centers.get(getSectorKey(d))
      if (!center || d.x == null || d.y == null) continue
      d.vx = (d.vx || 0) + (center.x - d.x) * strength
      d.vy = (d.vy || 0) + (center.y - d.y) * strength
    }
  }

  force.initialize = (newNodes: GraphNode[]) => {
    nodes = newNodes
    centersInitialized = false
  }

  return force
}

function createDragBehavior(simulation: d3.Simulation<GraphNode, undefined>) {
  return d3
    .drag<Element, GraphNode>()
    .on('start', (d) => {
      d.fx = d.x ?? null
      d.fy = d.y ?? null
      ;(d as any).__dragMoved = false
    })
    .on('drag', (event, d) => {
      if (!(d as any).__dragMoved) {
        simulation.alphaTarget(0.2).restart()
        ;(d as any).__dragMoved = true
      }
      d.fx = event.x
      d.fy = event.y
    })
    .on('end', (event, d) => {
      if (!event.active) simulation.alphaTarget(0)
      d.fx = null
      d.fy = null
      delete (d as any).__dragMoved
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any
}

function appendNodeVisuals(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selection: d3.Selection<any, GraphNode, any, any>
) {
  selection
    .append('circle')
    .attr('r', (d) => d.radius)
    .attr('fill', (d) => (d.type === 'holding' ? d.color : '#2d2d2d'))
    .attr('stroke', (d) => d.color)
    .attr('stroke-width', (d) => (d.type === 'watchlist' ? 3 : 0))

  selection
    .append('text')
    .text((d) => d.ticker)
    .attr('x', 0)
    .attr('y', (d) => d.radius + 14)
    .attr('text-anchor', 'middle')
    .attr('font-size', 12)
    .attr('font-weight', 'bold')
    .attr('fill', '#bdbdbd')
    .attr('pointer-events', 'none')
}

function bindTooltipEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selection: d3.Selection<any, GraphNode, any, any>,
  tooltip: d3.Selection<SVGGElement, unknown, null, undefined>
) {
  selection
    .on('mouseenter', (_event, d) => {
      if (d.x == null || d.y == null) return
      const isEtf = d.metadata?.etf
      const lines = [
        d.ticker,
        `${isEtf ? 'Asset Class' : 'Sector'}: ${d.metadata?.sector || '-'}`,
        `${isEtf ? 'Region' : 'Country'}: ${d.metadata?.country || '-'}`,
        d.metadata?.marketCapTier
          ? `Cap: ${d.metadata.marketCapTier.replace('_', ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase())}`
          : 'Cap: -',
      ]
      tooltip.style('display', 'block')
      tooltip.attr('transform', `translate(${d.x + d.radius + 8},${d.y - 40})`)

      tooltip.selectAll('text').remove()
      lines.forEach((line, i) => {
        tooltip
          .append('text')
          .attr('x', 6)
          .attr('y', 11 + i * 14)
          .attr('dominant-baseline', 'middle')
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
}

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
    etf?: boolean
  } | null
}

export type GraphEdge = d3.SimulationLinkDatum<GraphNode> & {
  strength: number
}

type HoldingGraphProps = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onNodeClick: (ticker: string) => void
  groupBySector?: boolean
  width?: number
  height?: number
}

export default function HoldingGraph({
  nodes,
  edges,
  onNodeClick,
  groupBySector = false,
  width = 800,
  height = 500,
}: HoldingGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const onNodeClickRef = useRef(onNodeClick)
  const simulationRef = useRef<d3.Simulation<GraphNode, undefined> | null>(null)
  const isFirstRender = useRef(true)
  const prevNodeIds = useRef('')
  const prevEdgeIds = useRef('')
  const prevGroupBySector = useRef(groupBySector)
  const groupBySectorRef = useRef(groupBySector)

  useEffect(() => {
    onNodeClickRef.current = onNodeClick
  }, [onNodeClick])

  useEffect(() => {
    groupBySectorRef.current = groupBySector
  }, [groupBySector])

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    const nodeIds = nodes.map((n) => n.id).join(',')
    const edgeIds = edges.map((e) => `${e.source}-${e.target}`).join(',')

    if (!isFirstRender.current) {
      if (
        nodeIds === prevNodeIds.current &&
        edgeIds === prevEdgeIds.current &&
        groupBySector === prevGroupBySector.current
      ) {
        return
      }
    }

    prevNodeIds.current = nodeIds
    prevEdgeIds.current = edgeIds
    prevGroupBySector.current = groupBySector

    const edgesCopy = edges.map((e) => ({ ...e }))
    const centerX = width / 2
    const centerY = height / 2
    const svg = d3.select(svgRef.current)

    if (isFirstRender.current) {
      svg.selectAll('*').remove()

      const g = svg.append('g')

      const zoom = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.5, 4])
        .on('zoom', (event) => {
          g.attr('transform', event.transform.toString())
        })

      svg.call(zoom)

      scatterFromCenter(nodes, centerX, centerY)

      const simulation = d3
        .forceSimulation<GraphNode>(nodes)
        .alphaDecay(0.06)
        .velocityDecay(0.6)
        .force(
          'link',
          d3
            .forceLink<GraphNode, GraphEdge>(edgesCopy)
            .id((d) => d.id)
            .distance(150)
            .strength((d) => d.strength * 0.03)
        )
        .force('charge', d3.forceManyBody<GraphNode>().strength(-80).distanceMax(200))
        .force('collision', d3.forceCollide<GraphNode>().radius((d) => d.radius + 10))
        .force('sector', createSectorGroupingForce(width, height, () => groupBySectorRef.current))

      simulationRef.current = simulation

      const link = g
        .append('g')
        .attr('stroke', 'rgba(255,255,255,0.45)')
        .attr('stroke-opacity', 0.6)
        .selectAll('line')
        .data(edgesCopy)
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

      const node = g
        .append('g')
        .selectAll('g')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .data(nodes, (d: any) => d.id)
        .join('g')
        .style('cursor', 'pointer')
        .call(createDragBehavior(simulation))
        .on('click', (_event, d) => {
          onNodeClickRef.current(d.ticker)
        })

      bindTooltipEvents(node, tooltip)
      appendNodeVisuals(node)

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

    const simulation = simulationRef.current
    if (!simulation) return

    const g = svg.select<SVGGElement>('g')
    if (g.empty()) return

    const link = g
      .selectAll<SVGLineElement, GraphEdge>('line')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .data(edgesCopy, (d: any) => `${d.source}-${d.target}`)
    link.exit().remove()
    const linkEnter = link.enter().append('line').attr('stroke-width', (d) => Math.max(1, d.strength * 1.5))
    const linkMerged = linkEnter.merge(link)
    linkMerged.attr('stroke-width', (d) => Math.max(1, d.strength * 1.5))

    const linkForce = simulation.force<d3.ForceLink<GraphNode, GraphEdge>>('link')
    if (linkForce) {
      linkForce.links(edgesCopy)
    }

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
      .call(createDragBehavior(simulation))
      .on('click', (_event, d) => {
        onNodeClickRef.current(d.ticker)
      })

    bindTooltipEvents(nodeEnter, tooltip)
    appendNodeVisuals(nodeEnter)

    const nodeMerged = nodeEnter.merge(node)

    simulation.on('tick', () => {
      linkMerged
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0)

      nodeMerged.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    simulation.nodes(nodes)

    if (groupBySector !== prevGroupBySector.current) {
      simulation.alpha(0.4).restart()
    } else {
      simulation.alpha(0.1).restart()
    }
  }, [nodes, edges, width, height, groupBySector])

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
