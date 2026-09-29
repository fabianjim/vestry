import { useLayoutEffect, useRef } from 'react'

// Offset coordinates describe the CSS grid's destinations, unaffected by zoom or animation.
export function movementFrom(previous: { x: number; y: number }, next: { x: number; y: number }, current = { x: 0, y: 0 }) {
  return { x: previous.x - next.x + current.x, y: previous.y - next.y + current.y }
}

export function useHoldingsMotion(zoomed: boolean, ready: boolean, dragging = false) {
  const scale = zoomed ? 0.88 : 1
  const frame = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const positions = useRef(new Map<Element, { x: number; y: number }>())
  const animations = useRef(new Map<Element, Animation>())

  useLayoutEffect(() => {
    const container = frame.current
    const content = grid.current
    if (!container || !content) return
    const resize = () => {
      const height = content.offsetHeight * scale
      // Reflow must not shorten the scroll area and move the pointer into another slot.
      container.style.height = `${dragging ? Math.max(parseFloat(container.style.height) || 0, height) : height}px`
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(content)
    return () => observer.disconnect()
  }, [scale, ready, dragging])

  useLayoutEffect(() => {
    const content = grid.current
    if (!content) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const next = new Map<Element, { x: number; y: number }>()
    for (const element of content.children) {
      const card = element as HTMLElement
      const position = { x: card.offsetLeft, y: card.offsetTop }
      next.set(card, position)
      const previous = positions.current.get(card)
      if (!previous || (previous.x === position.x && previous.y === position.y)) continue
      const transform = getComputedStyle(card).transform
      const current = transform === 'none' ? { x: 0, y: 0 } : (() => {
        const matrix = new DOMMatrixReadOnly(transform)
        return { x: matrix.m41, y: matrix.m42 }
      })()
      animations.current.get(card)?.cancel()
      const delta = movementFrom(previous, position, current)
      if (!reducedMotion && (delta.x || delta.y)) {
        const animation = card.animate([
          { transform: `translate(${delta.x}px, ${delta.y}px)` },
          { transform: 'translate(0, 0)' },
        ], { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
        animations.current.set(card, animation)
        animation.onfinish = () => { animations.current.delete(card) }
      }
    }
    for (const [element, animation] of animations.current) {
      if (!next.has(element)) { animation.cancel(); animations.current.delete(element) }
    }
    positions.current = next
  })

  useLayoutEffect(() => {
    const running = animations.current
    return () => { for (const animation of running.values()) animation.cancel(); running.clear() }
  }, [])

  return { frame, grid, scale }
}
