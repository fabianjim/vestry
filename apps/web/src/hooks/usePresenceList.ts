import { useEffect, useState } from 'react'
import { mergePresence, type Presence } from '../utils/presenceList'

/**
 * Keeps leaving items mounted long enough to collapse, and lets joining items render
 * collapsed for a frame so they can grow in. The first non-empty list appears without motion.
 */
export function usePresenceList<T extends { id: number }>(items: T[], exitMs = 450) {
  const [rendered, setRendered] = useState<Presence<T>[]>(() => items.map(item => ({ item, status: 'shown' })))
  const [prevItems, setPrevItems] = useState(items)
  const [settled, setSettled] = useState(items.length > 0)

  if (items !== prevItems) {
    setPrevItems(items)
    if (!settled && items.length > 0) {
      setSettled(true)
      setRendered(items.map(item => ({ item, status: 'shown' })))
    } else {
      setRendered(mergePresence(rendered, items))
    }
  }

  useEffect(() => {
    if (!rendered.some(entry => entry.status === 'enter')) return
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setRendered(current =>
        current.map(entry => entry.status === 'enter' ? { ...entry, status: 'shown' } : entry)))
    })
    return () => cancelAnimationFrame(frame)
  }, [rendered])

  useEffect(() => {
    if (!rendered.some(entry => entry.status === 'exit')) return
    const timeout = setTimeout(() => setRendered(current => current.filter(entry => entry.status !== 'exit')), exitMs)
    return () => clearTimeout(timeout)
  }, [rendered, exitMs])

  return rendered
}
