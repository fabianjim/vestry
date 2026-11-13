import { useEffect, useRef, useState } from 'react'

/** Whether the element is on screen right now (unlike useScrollReveal, it turns false again when it leaves). */
export function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold })
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, inView }
}
