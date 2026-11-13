import { useEffect, useState } from 'react'
import { prefersReducedMotion } from './useHeroPlayback'

/**
 * Cycles 0..count-1 every `interval` ms while `running`. Reduced motion never auto-advances; `select`
 * still lets the viewer pick a step, and restarts the interval from there.
 */
export function useLoopStep(count: number, interval: number, running: boolean) {
  const [step, setStep] = useState(0)
  const [cycle, setCycle] = useState(0)
  const auto = running && !prefersReducedMotion()

  useEffect(() => {
    if (!auto || count < 2) return
    const timer = window.setInterval(() => setStep((value) => (value + 1) % count), interval)
    return () => window.clearInterval(timer)
  }, [auto, count, interval, cycle])

  const select = (index: number) => {
    setStep(index)
    setCycle((value) => value + 1)
  }

  return { step, select, auto }
}
