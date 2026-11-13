import { useEffect, useState } from 'react'

/**
 * Index of the current section: the last one whose top has passed `line` (px from the viewport top).
 * Before the first section passes, the first is current; at the bottom of the page, the last is, so a
 * short final section can still become current.
 */
export function pickActiveSection(tops: number[], line: number, atBottom: boolean): number {
  if (tops.length === 0) return -1
  if (atBottom) return tops.length - 1
  let active = 0
  tops.forEach((top, index) => {
    if (top <= line) active = index
  })
  return active
}

/** Tracks which of the sections with these ids is current as the page scrolls. Exactly one is current. */
export function useActiveSection(ids: string[], line = 120): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null)
  const key = ids.join(',')

  useEffect(() => {
    const sectionIds = key ? key.split(',') : []
    let frame = 0

    const update = () => {
      frame = 0
      const tops = sectionIds.map((id) => document.getElementById(id)?.getBoundingClientRect().top ?? Infinity)
      const root = document.documentElement
      const atBottom = window.innerHeight + window.scrollY >= root.scrollHeight - 2
      const index = pickActiveSection(tops, line, atBottom)
      setActive(index < 0 ? null : sectionIds[index])
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [key, line])

  return active
}
