import { useState, useEffect, useMemo } from 'react'
import { getNextMarketUpdate, formatNextUpdate } from '../utils/dateUtils'

const MS_PER_MINUTE = 60_000

const getMsUntilNextMinute = (now = new Date()): number => {
  return MS_PER_MINUTE - (now.getTime() % MS_PER_MINUTE)
}

export function useNextUpdate() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null

    const startInterval = () => {
      setNow(new Date())
      intervalId = setInterval(() => setNow(new Date()), MS_PER_MINUTE)
    }

    const timeoutId = setTimeout(startInterval, getMsUntilNextMinute())

    return () => {
      clearTimeout(timeoutId)
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  const nextUpdate = useMemo(() => getNextMarketUpdate(now), [now])
  const display = useMemo(() => formatNextUpdate(nextUpdate, now), [nextUpdate, now])
  const isImminent = nextUpdate.getTime() - now.getTime() <= 15 * MS_PER_MINUTE

  return { display, nextUpdate, isImminent }
}
