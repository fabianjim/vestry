import { describe, expect, it } from 'vitest'
import { paddedDomain, placeLabels, separateMarkers, type LabelPoint } from './scatterLabels'

const box = (x: number, y: number, width: number) => ({ left: x - width / 2, right: x + width / 2, top: y - 6, bottom: y + 6 })
const intersects = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

describe('scatter labels', () => {
  it('fits the weight axis to the data instead of the full 0–100% range', () => {
    expect(paddedDomain([4, 12, 18], { include: 0, min: 0, max: 100 }).domain).toEqual([0, 20])
    expect(paddedDomain([100], { include: 0, min: 0, max: 100 }).domain).toEqual([0, 100])
    expect(paddedDomain([-8, -3], { include: 0 }).domain[1]).toBeGreaterThanOrEqual(0)
  })

  it('keeps labels of clustered points apart and marks displaced ones with a leader', () => {
    const points: LabelPoint[] = ['AAPL', 'MSFT', 'NVDA', 'GOOG', 'AMZN', 'META', 'TSLA', 'AMD', 'INTC', 'ORCL', 'CRM', 'ADBE'].map((id, index) => ({ id, x: 200 + index * 3, y: 100 + index * 2, width: 30 }))
    const labels = placeLabels(points, { left: 0, top: 0, right: 400, bottom: 300 })
    const boxes = labels.map(label => box(label.x, label.y, 30))
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(intersects(boxes[i], boxes[j])).toBe(false)
    expect(labels.some(label => label.leader)).toBe(true)
  })

  it('puts a lone label directly above its point', () => {
    expect(placeLabels([{ id: 'A', x: 50, y: 50, width: 10 }], { left: 0, top: 0, right: 100, bottom: 100 }))
      .toEqual([{ id: 'A', x: 50, y: 50 - 5 - 3 - 6, leader: false }])
  })
})

describe('marker separation', () => {
  it('spreads only markers sitting almost on top of each other', () => {
    const [a, b, c] = separateMarkers([{ id: 'A', x: 100, y: 100 }, { id: 'B', x: 101, y: 100 }, { id: 'C', x: 110, y: 100 }])
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(10)
    expect((a.x + b.x) / 2).toBeCloseTo(100.5)
    expect(c).toEqual({ id: 'C', x: 110, y: 100 })
  })

  it('keeps every member of a stacked group apart', () => {
    const moved = separateMarkers(['A', 'B', 'C', 'D'].map(id => ({ id, x: 50, y: 50 })))
    for (let i = 0; i < moved.length; i++) for (let j = i + 1; j < moved.length; j++) {
      expect(Math.hypot(moved[i].x - moved[j].x, moved[i].y - moved[j].y)).toBeGreaterThanOrEqual(10)
    }
  })
})
