const MARKET_TZ = 'America/New_York'

// rounds timestamp to hours:minutes in EST
export const roundToMinute = (timestamp: string): string => {
    if(!timestamp) return '';
    const date = new Date(timestamp);
    date.setSeconds(0, 0);
    return date.toLocaleTimeString("en-US", {timeZone: MARKET_TZ, hour: '2-digit', minute: '2-digit'});
}

// formats timestamp to date and time in EST
export const formatDateTime = (timestamp: string): string => {
    if(!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
        timeZone: MARKET_TZ,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

type MarketParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
}

const getMarketParts = (date: Date): MarketParts => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: MARKET_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? '0'

  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    hour: Number(value('hour')),
    minute: Number(value('minute')),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday')),
  }
}

/**
 * Builds a Date representing the given wall-clock time in America/New_York.
 * Corrects for the timezone offset so the returned instant displays as the
 * requested year/month/day hour:minute in MARKET_TZ.
 */
const buildMarketDate = (year: number, month: number, day: number, hour: number, minute: number): Date => {
  const target = new Date(Date.UTC(year, month - 1, day, hour, minute))
  const { year: y, month: m, day: d, hour: h, minute: min } = getMarketParts(target)
  const actual = new Date(Date.UTC(y, m - 1, d, h, min))
  const diff = target.getTime() - actual.getTime()
  return new Date(target.getTime() + diff)
}

/**
 * Checks whether the given instant falls on a US market weekday (Mon–Fri)
 * between 10:00 and 16:00 Eastern Time.
 */
export const isTradingHours = (timestamp: string | number | Date): boolean => {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
  const { weekday, hour, minute } = getMarketParts(date)
  if (weekday === 0 || weekday === 6) return false
  const timeValue = hour + minute / 60
  return timeValue >= 10 && timeValue <= 16
}

/**
 * Checks whether two instants fall on the same calendar day in Eastern Time.
 */
export const isSameMarketDay = (timestamp: string | number | Date, date: Date): boolean => {
  const a = getMarketParts(new Date(timestamp))
  const b = getMarketParts(date)
  return a.year === b.year && a.month === b.month && a.day === b.day
}

/**
 * Computes the next scheduled portfolio price update in America/New_York time.
 * Mirrors the backend schedule:
 *   - Weekdays before 10:00: today at 10:00
 *   - Weekdays 10:00–15:59: top of the next hour
 *   - Weekdays 16:00–16:29: 16:30 EOD fetch
 *   - After 16:30 and weekends: next weekday 10:00
 */
export const getNextMarketUpdate = (now = new Date()): Date => {
  const { year, month, day, hour, minute, weekday } = getMarketParts(now)

  const isWeekday = weekday >= 1 && weekday <= 5

  if (isWeekday && hour < 10) {
    return buildMarketDate(year, month, day, 10, 0)
  }

  if (isWeekday && hour >= 10 && hour < 16) {
    return buildMarketDate(year, month, day, hour + 1, 0)
  }

  if (isWeekday && hour === 16 && minute < 30) {
    return buildMarketDate(year, month, day, 16, 30)
  }

  let daysAhead = 1
  if (weekday === 5) daysAhead = 3
  else if (weekday === 6) daysAhead = 2

  return buildMarketDate(year, month, day + daysAhead, 10, 0)
}

/**
 * Formats the next update time for display:
 *   - Within one hour: "in Xm"
 *   - More than one hour and tomorrow: "Tomorrow 10 AM"
 *   - Otherwise: "Mon 10 AM"
 */
export const formatNextUpdate = (next: Date, now = new Date()): string => {
  const diffMs = next.getTime() - now.getTime()
  const diffMinutes = Math.max(0, Math.ceil(diffMs / 60_000))

  if (diffMinutes <= 60) {
    return `in ${diffMinutes}m`
  }

  const nowParts = getMarketParts(now)
  const tomorrow = buildMarketDate(nowParts.year, nowParts.month, nowParts.day + 1, 12, 0)
  const tomorrowParts = getMarketParts(tomorrow)

  const nextParts = getMarketParts(next)
  const isTomorrow =
    nextParts.year === tomorrowParts.year &&
    nextParts.month === tomorrowParts.month &&
    nextParts.day === tomorrowParts.day

  const timeLabel = next.toLocaleTimeString('en-US', {
    timeZone: MARKET_TZ,
    hour: 'numeric',
    minute: nextParts.minute !== 0 ? '2-digit' : undefined,
    hour12: true,
  })

  if (isTomorrow) {
    return `Tomorrow ${timeLabel}`
  }

  const dayLabel = next.toLocaleDateString('en-US', {
    timeZone: MARKET_TZ,
    weekday: 'short',
  })

  return `${dayLabel} ${timeLabel}`
}
