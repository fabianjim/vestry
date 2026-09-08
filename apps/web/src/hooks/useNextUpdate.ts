import { useState, useEffect } from 'react'
import { formatNextUpdate } from '../utils/dateUtils'
import { stockApi } from '../services/api'

const MS_PER_MINUTE = 60_000

export function useNextUpdate() {
  const [now, setNow] = useState(() => new Date())
  const [nextUpdate, setNextUpdate] = useState<Date | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    let pending = false
    let scheduled: Date | null = null

    const refresh = async (force = false) => {
      const current = new Date()
      setNow(current)
      if (pending || (!force && scheduled && scheduled > current)) return
      pending = true
      try {
        const response = await stockApi.getUpdateSchedule()
        const next = new Date(response.nextUpdate)
        if (!Number.isFinite(next.getTime()) || next <= current) throw new Error('Invalid update schedule')
        if (active) {
          scheduled = next
          setNextUpdate(next)
          setFailed(false)
        }
      } catch {
        if (active) setFailed(true)
      } finally {
        pending = false
      }
    }

    const resume = () => {
      if (document.visibilityState === 'visible') void refresh(true)
    }
    void refresh()
    // Refresh the countdown each minute; fetch the next schedule only when due.
    let intervalId: ReturnType<typeof setInterval> | undefined
    const timeoutId = setTimeout(() => {
      void refresh()
      intervalId = setInterval(() => void refresh(), MS_PER_MINUTE)
    }, MS_PER_MINUTE - (Date.now() % MS_PER_MINUTE))
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    return () => {
      active = false
      clearTimeout(timeoutId)
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('focus', resume)
    }
  }, [])

  const hasFutureUpdate = nextUpdate !== null && nextUpdate > now
  const display = hasFutureUpdate
    ? formatNextUpdate(nextUpdate, now)
    : failed ? 'Unavailable' : 'Checking…'
  const isImminent = hasFutureUpdate && nextUpdate.getTime() - now.getTime() <= 15 * MS_PER_MINUTE

  return { display, nextUpdate, isImminent }
}
