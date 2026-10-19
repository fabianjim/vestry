import { useCallback, useEffect, useRef, useState } from 'react'
import { heroFrameAt, type HeroFrame, type HeroTimeline } from '../utils/heroTimeline'

// Background tabs and long frames resume where they left off instead of jumping ahead.
const MAX_FRAME_MS = 50

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

const sameFrame = (a: HeroFrame, b: HeroFrame) =>
  a.done === b.done && a.visible === b.visible && a.typed.every((count, i) => count === b.typed[i])

/**
 * Plays a hero timeline once. React state changes only when markers, cards or typed text change;
 * per-frame line progress goes to `subscribe` listeners so the chart is not re-rendered every frame.
 */
export function useHeroPlayback(timeline: HeroTimeline) {
  const [reduced] = useState(prefersReducedMotion)
  const elapsed = useRef(reduced ? timeline.duration : 0)
  const listeners = useRef(new Set<(frame: HeroFrame) => void>())
  const [frame, setFrame] = useState(() => heroFrameAt(timeline, elapsed.current))

  const publish = useCallback(() => {
    const next = heroFrameAt(timeline, elapsed.current)
    listeners.current.forEach(listener => listener(next))
    setFrame(previous => sameFrame(previous, next) ? previous : next)
  }, [timeline])

  useEffect(() => {
    if (elapsed.current >= timeline.duration) return
    let handle = 0
    let last: number | null = null
    const tick = (now: number) => {
      elapsed.current = Math.min(timeline.duration, elapsed.current + (last == null ? 0 : Math.min(now - last, MAX_FRAME_MS)))
      last = now
      publish()
      if (elapsed.current < timeline.duration) handle = requestAnimationFrame(tick)
    }
    handle = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(handle)
  }, [timeline, publish])

  const subscribe = useCallback((listener: (frame: HeroFrame) => void) => {
    listeners.current.add(listener)
    listener(heroFrameAt(timeline, elapsed.current))
    return () => { listeners.current.delete(listener) }
  }, [timeline])

  return { frame, subscribe }
}
