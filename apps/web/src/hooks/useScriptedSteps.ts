import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from './useHeroPlayback'

/**
 * Advances through steps at fixed offsets (ms) once the element is mostly in view.
 * Plays once per mount; reduced motion lands on the final step immediately.
 */
export function useScriptedSteps<T extends HTMLElement>(offsets: number[]) {
  const ref = useRef<T>(null)
  const [step, setStep] = useState(() => prefersReducedMotion() ? offsets.length - 1 : 0)

  useEffect(() => {
    const el = ref.current
    if (!el || step === offsets.length - 1) return
    const timers: number[] = []
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      offsets.forEach((offset, index) => {
        if (index > 0) timers.push(window.setTimeout(() => setStep(index), offset))
      })
    }, { threshold: 0.5 })
    observer.observe(el)
    return () => {
      observer.disconnect()
      timers.forEach(clearTimeout)
    }
    // Starts once; later step changes must not restart the script.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offsets])

  return { ref, step, done: step === offsets.length - 1 }
}
