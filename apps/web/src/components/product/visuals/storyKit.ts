import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useInView } from '../../../hooks/useInView'
import { prefersReducedMotion } from '../../../hooks/useHeroPlayback'

/*
 * Shared pieces of the Product page's stories: a scaled copy of the app window, a cursor and a list of
 * timed frames that plays only while the window is on screen.
 */

// Design size of the app window; it is scaled to fit the panel.
export const W = 1040
export const H = 640

export const STORY_EASE = 'ease-[cubic-bezier(0.45,0,0.2,1)]'

/** Each step changes only what it names; everything else carries over. `click` and `fade` never carry. */
export function buildFrames<F extends { ms: number; click: boolean; fade: boolean }>(initial: F, steps: Partial<F>[]): F[] {
  return steps.reduce<F[]>((frames, step) => {
    const previous = frames[frames.length - 1] ?? initial
    return [...frames, { ...previous, click: false, fade: false, ...step }]
  }, [])
}

/** The current frame: advances while on screen and not paused, loops, and holds `still` under reduced motion. */
export function useStoryFrames<F extends { ms: number }>(frames: F[], still: F, paused = false) {
  const { ref: viewRef, inView } = useInView<HTMLDivElement>(0.35)
  const reduced = prefersReducedMotion()
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!inView || reduced || paused) return
    const timer = window.setTimeout(() => setIndex((value) => (value + 1) % frames.length), frames[index].ms)
    return () => window.clearTimeout(timer)
  }, [inView, reduced, paused, index, frames])
  return { viewRef, reduced, frame: reduced ? still : frames[index] }
}

/** Types `text` one character every `ms` while `typing` (holding while `paused`); shows it whole once `done`, and clears otherwise. */
export function useTyped(text: string, typing: boolean, done: boolean, ms: number, paused = false) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!typing) {
      if (!done) setCount(0)
      return
    }
    if (paused) return
    const timer = window.setInterval(() => setCount((value) => Math.min(text.length, value + 1)), ms)
    return () => window.clearInterval(timer)
  }, [typing, done, text, ms, paused])
  return done ? text : text.slice(0, count)
}

export function useScale(designWidth: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / designWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [designWidth])
  return { ref, scale }
}

/** Offset of `el` inside `root`, ignoring transforms (so a moving camera or a card mid-FLIP doesn't skew it). */
export function offsetWithin(el: HTMLElement, root: HTMLElement) {
  let x = 0
  let y = 0
  let node: HTMLElement | null = el
  while (node && node !== root) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }
  return { x, y }
}

/** The element a frame names with `data-cursor`. */
export const findTarget = (root: HTMLElement, name: string) => root.querySelector<HTMLElement>(`[data-cursor="${name}"]`)

/** Center of `target` inside `root`, less how far its scrolling container's camera has moved. */
export function centerOf(target: HTMLElement, root: HTMLElement, camera = 0) {
  const at = offsetWithin(target, root)
  return { x: at.x + target.offsetWidth / 2, y: at.y + target.offsetHeight / 2 - camera }
}
