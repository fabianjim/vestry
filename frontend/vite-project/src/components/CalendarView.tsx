import { useState, useEffect } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'
import { journalApi } from '../services/api'
import type { CalendarDay, JournalFilters } from '../types/journal'

interface CalendarViewProps {
  onDayClick: (date: Date) => void
  activeDate?: Date | null
  filters?: JournalFilters
  className?: string
}

const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export default function CalendarView({ onDayClick, activeDate, filters, className = '' }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [dayCounts, setDayCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const data = (await journalApi.getCalendarEntries(
          currentDate.getFullYear(),
          currentDate.getMonth() + 1,
          filters
        )) as CalendarDay[]
        const counts: Record<string, number> = {}
        data.forEach((d) => (counts[d.date] = d.count))
        setDayCounts(counts)
      } catch (e) {
        console.error('Failed to load calendar:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentDate, filters])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startDayOfWeek = firstDayOfMonth.getDay()

  const days: (number | null)[] = []
  for (let i = 0; i < startDayOfWeek; i++) days.push(null)
  for (let i = 1; i <= daysInMonth; i++) days.push(i)

  const padDate = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const navigate = (delta: number) => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  const isActive = (day: number) => {
    if (!activeDate) return false
    return (
      activeDate.getFullYear() === year &&
      activeDate.getMonth() === month &&
      activeDate.getDate() === day
    )
  }

  const maxCount = Math.max(...Object.values(dayCounts), 1)

  return (
    <div className={`p-4 bg-surface rounded-lg border border-border ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate(-1)}
          className="p-1 rounded-md hover:bg-surface-hover text-secondary hover:text-foreground transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </button>
        <span className="text-foreground font-130">
          {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
        <button
          onClick={() => navigate(1)}
          className="p-1 rounded-md hover:bg-surface-hover text-secondary hover:text-foreground transition-colors"
          aria-label="Next month"
        >
          <ChevronRightIcon className="w-5 h-5" />
        </button>
      </div>

      {loading && Object.keys(dayCounts).length === 0 && (
        <div className="text-sm text-muted">Loading calendar...</div>
      )}

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEK_DAYS.map((d) => (
          <div key={d} className="text-xs text-muted py-1">{d}</div>
        ))}
        {days.map((day, idx) => {
          if (!day) return <div key={idx} />
          const dateKey = padDate(day)
          const count = dayCounts[dateKey] || 0
          const intensity = count > 0 ? Math.max(0.2, count / maxCount) : 0
          return (
            <button
              key={idx}
              onClick={() => onDayClick(new Date(year, month, day))}
              className={`relative aspect-square flex flex-col items-center justify-center rounded-md text-sm transition-colors ${
                isActive(day)
                  ? 'ring-2 ring-primary bg-primary/20 text-primary'
                  : count > 0
                  ? 'hover:bg-surface-hover text-foreground'
                  : 'text-secondary hover:bg-surface-hover'
              }`}
              style={
                count > 0 && !isActive(day)
                  ? { backgroundColor: `rgba(94, 158, 214, ${intensity * 0.35})` }
                  : undefined
              }
            >
              <span>{day}</span>
              {count > 0 && (
                <span className="absolute bottom-0.5 text-[9px] leading-none text-primary">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
