import { scaleLinear } from 'd3'

/** A rounded axis domain around the values, padded so markers stay off the plot edges. */
export function paddedDomain(values: number[], { min, max, include }: { min?: number; max?: number; include?: number } = {}) {
  const all = include == null ? values : [...values, include]
  if (!all.length) return { domain: [0, 1] as [number, number], ticks: [0, 1] }
  let low = Math.min(...all)
  let high = Math.max(...all)
  const pad = high > low ? (high - low) * 0.1 : Math.max(Math.abs(high) * 0.1, 1)
  low -= pad
  high += pad
  if (min != null) low = Math.max(low, min)
  if (max != null) high = Math.min(high, max)
  const scale = scaleLinear().domain([low, high]).nice(5)
  const [start, end] = scale.domain()
  return { domain: [start, end] as [number, number], ticks: scale.ticks(5) }
}

type Box = { left: number; top: number; right: number; bottom: number }
export type LabelPoint = { id: string; x: number; y: number; width: number }
export type PlacedLabel = { id: string; x: number; y: number; leader: boolean }

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))

// Unit directions, best first: above, below, beside, then the diagonals.
const DIRECTIONS = [[0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]]

/**
 * Places each label near its marker without overlapping other labels or markers.
 * Positions are label centres in pixels. Labels pushed beyond the first ring get a leader line.
 */
export function placeLabels(points: LabelPoint[], bounds: Box, { height = 12, radius = 5, gap = 3, rings = 4 } = {}): PlacedLabel[] {
  const markers = points.map(p => ({ left: p.x - radius, top: p.y - radius, right: p.x + radius, bottom: p.y + radius }))
  const placed: Box[] = []
  const result = new Map<string, PlacedLabel>()
  // Points with the most close neighbours choose first, while space is still free.
  const crowding = (p: LabelPoint) => points.filter(q => Math.hypot(q.x - p.x, q.y - p.y) < 40).length
  const order = [...points].sort((a, b) => crowding(b) - crowding(a))

  for (const point of order) {
    let best: { box: Box; cost: number; ring: number } | null = null
    for (let ring = 0; ring < rings && best?.cost !== 0; ring++) {
      for (const [dx, dy] of DIRECTIONS) {
        const x = point.x + dx * (radius + gap + point.width / 2 + ring * point.width / 2)
        const y = point.y + dy * (radius + gap + height / 2 + ring * height)
        const box = { left: x - point.width / 2, top: y - height / 2, right: x + point.width / 2, bottom: y + height / 2 }
        const outside = box.left < bounds.left || box.right > bounds.right || box.top < bounds.top || box.bottom > bounds.bottom
        const cost = (outside ? 1e6 : 0)
          + placed.reduce((sum, other) => sum + overlap(box, other), 0)
          + markers.reduce((sum, marker) => sum + overlap(box, marker), 0)
        if (!best || cost < best.cost) best = { box, cost, ring }
        if (cost === 0) break
      }
    }
    const { box, ring } = best!
    placed.push(box)
    result.set(point.id, { id: point.id, x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2, leader: ring > 0 })
  }
  return points.map(p => result.get(p.id)!)
}

/**
 * Spreads markers that sit almost exactly on top of each other (closer than `threshold` pixels)
 * evenly around their shared centre, just far enough apart to be told apart. Others don't move.
 */
export function separateMarkers<T extends { id: string; x: number; y: number }>(points: T[], { radius = 4.5, threshold = 4 } = {}): T[] {
  const parent = points.map((_, index) => index)
  const root = (i: number): number => parent[i] === i ? i : (parent[i] = root(parent[i]))
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    if (Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) < threshold) parent[root(i)] = root(j)
  }
  const groups = new Map<number, number[]>()
  points.forEach((_, index) => groups.set(root(index), [...groups.get(root(index)) ?? [], index]))
  const result = [...points]
  for (const members of groups.values()) {
    if (members.length < 2) continue
    members.sort((a, b) => points[a].id.localeCompare(points[b].id))
    const cx = members.reduce((sum, i) => sum + points[i].x, 0) / members.length
    const cy = members.reduce((sum, i) => sum + points[i].y, 0) / members.length
    // Neighbours on the ring sit one marker diameter plus a pixel apart.
    const spread = (radius * 2 + 1) / (2 * Math.sin(Math.PI / members.length))
    members.forEach((i, k) => {
      const angle = Math.PI + 2 * Math.PI * k / members.length
      result[i] = { ...points[i], x: cx + spread * Math.cos(angle), y: cy + spread * Math.sin(angle) }
    })
  }
  return result
}
