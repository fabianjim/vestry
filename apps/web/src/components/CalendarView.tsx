import { useState, useMemo, useRef, useEffect, type PointerEvent } from 'react'
import { filterDateKey, marketDateKey, selectedDates, selectDates } from '../utils/calendarSelection'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'
import { useQuery } from '@tanstack/react-query'
import { journalQueries } from '../services/queries'
import type { JournalFilters } from '../types/journal'

interface CalendarViewProps {
  onSelectionChange: (dates: string[]) => void
  filters?: JournalFilters
  className?: string
}

const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export default function CalendarView({ onSelectionChange, filters = {}, className = '' }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => {
    const initial = filterDateKey(filters.from) || filters.dates?.[0] || marketDateKey()
    return new Date(`${initial}T12:00:00`)
  })
  const selection = useMemo(() => selectedDates(filters), [filters])
  const selectionKey = JSON.stringify([filters.from, filters.to, filters.dates])
  const gridRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<{
    pointerId: number; start: string; end: string; base: string[];
    additive: boolean; dates: string[];
  } | null>(null)
  const [preview, setPreview] = useState<{ dates: string[]; sourceKey: string } | null>(null)
  const previewDates = preview?.sourceKey === selectionKey ? preview.dates : null
  const visibleSelection = new Set(previewDates ?? selection)

  // Retain the finished preview until the router supplies the committed filters.
  useEffect(() => { setPreview(null) }, [selectionKey])

  const endGesture = (commit: boolean) => {
    const active = gesture.current
    if (!active) return
    gesture.current = null
    if (gridRef.current?.hasPointerCapture(active.pointerId)) {
      gridRef.current.releasePointerCapture(active.pointerId)
    }
    if (commit) onSelectionChange(active.dates)
    else setPreview(null)
  }

  const beginSelection = (event: PointerEvent<HTMLButtonElement>, date: string) => {
    if (event.button !== 0 || gesture.current) return
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    const additive = event.metaKey
    const dates = selectDates(selection, date, date, additive, false)
    gesture.current = { pointerId: event.pointerId, start: date, end: date, base: selection, additive, dates }
    setPreview({ dates, sourceKey: selectionKey })
    gridRef.current?.setPointerCapture(event.pointerId)
  }

  const moveSelection = (event: PointerEvent<HTMLDivElement>) => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>('[data-calendar-date]')
    const date = target?.dataset.calendarDate
    // Pointer events fire for every pixel; update only when entering another date.
    if (!date || date === active.end || !gridRef.current?.contains(target)) return
    active.end = date
    active.dates = selectDates(active.base, active.start, date, active.additive, true)
    setPreview({ dates: active.dates, sourceKey: selectionKey })
  }

  const finishSelection = (event: PointerEvent<HTMLDivElement>) => {
    if (!gesture.current || gesture.current.pointerId !== event.pointerId) return
    moveSelection(event)
    endGesture(true)
  }

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const query = useQuery(journalQueries.calendar(year, month + 1, filters))
  const dayCounts = useMemo(() => Object.fromEntries(
    (query.data ?? []).map(day => [day.date, day.count]),
  ), [query.data])
  const days = useMemo(() => {
    const offset = new Date(year, month, 1).getDay()
    const count = new Date(year, month + 1, 0).getDate()
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' })
    return Array.from({ length: offset + count }, (_, index) => {
      if (index < offset) return null
      const day = index - offset + 1
      const date = new Date(Date.UTC(year, month, day))
      return { day, key: date.toISOString().slice(0, 10), label: formatter.format(date), column: index % 7 }
    })
  }, [year, month])

  const navigate = (delta: number) => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }
  const from = filterDateKey(filters.from)
  const to = filterDateKey(filters.to)
  const isActive = (key?: string) => {
    if (!key) return false
    if (previewDates || selection.length || filters.dates?.length) return visibleSelection.has(key)
    return Boolean((from || to) && (!from || key >= from) && (!to || key <= to))
  }

  const maxCount = Math.max(...Object.values(dayCounts), 1)

  return (
    <div className={`p-4 bg-surface rounded-lg border border-border ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate(-1)}
          className="p-1 rounded-md hover:bg-surface-hover active:bg-surface-active text-secondary hover:text-foreground transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </button>
        <span className="text-foreground font-130">
          {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
        <button
          onClick={() => navigate(1)}
          className="p-1 rounded-md hover:bg-surface-hover active:bg-surface-active text-secondary hover:text-foreground transition-colors"
          aria-label="Next month"
        >
          <ChevronRightIcon className="w-5 h-5" />
        </button>
      </div>

      {query.error && <div className="text-error text-sm">{query.error.message}</div>}
      {query.isPending && Object.keys(dayCounts).length === 0 && (
        <div className="text-sm text-muted">Loading calendar...</div>
      )}

      <div
        ref={gridRef}
        className="grid grid-cols-7 gap-y-1 text-center select-none touch-none"
        onPointerMove={moveSelection}
        onPointerUp={finishSelection}
        onPointerCancel={() => endGesture(false)}
        onLostPointerCapture={() => endGesture(false)}
        onKeyDown={event => {
          if (event.key === 'Escape' && gesture.current) {
            event.preventDefault()
            endGesture(false)
          }
        }}
      >
        {WEEK_DAYS.map((d, index) => (
          <div key={index} className="text-xs text-muted py-1">{d}</div>
        ))}
        {days.map((cell, idx) => {
          if (!cell) return <div key={idx} />
          const { day, key: dateKey, label, column } = cell
          const count = dayCounts[dateKey] || 0
          const intensity = count > 0 ? Math.max(0.2, count / maxCount) : 0
          const active = isActive(dateKey)
          const connectsLeft = active && column > 0 && isActive(days[idx - 1]?.key)
          const connectsRight = active && column < 6 && isActive(days[idx + 1]?.key)
          return (
            <button
              key={idx}
              type="button"
              data-calendar-date={dateKey}
              aria-label={`${label}, ${count} ${count === 1 ? 'entry' : 'entries'}`}
              aria-pressed={active}
              onPointerDown={event => beginSelection(event, dateKey)}
              onClick={event => {
                // Pointer gestures commit on release; keyboard activation still uses click.
                if (event.detail !== 0) return
                onSelectionChange(selectDates(selection, dateKey, dateKey, event.metaKey, false))
              }}
              className={`group relative aspect-square flex flex-col items-center justify-center text-sm focus-visible:z-10 ${
                active ? 'text-primary' : count > 0 ? 'text-foreground' : 'text-secondary'
              }`}
            >
              {/* Keep the button's hit area rectangular as the highlight changes shape. */}
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 ${connectsLeft ? '' : 'rounded-l-md'} ${
                  connectsRight ? '' : 'rounded-r-md'
                } ${active ? 'bg-primary-soft' : 'group-hover:bg-surface-hover group-active:bg-surface-active'}`}
                style={count > 0 && !active
                  ? { backgroundColor: `color-mix(in srgb, var(--color-primary) ${intensity * 35}%, var(--color-surface))` }
                  : undefined}
              />
              <span className="relative pointer-events-none">{day}</span>
              {count > 0 && (
                <span className="pointer-events-none absolute bottom-0.5 text-[11px] leading-none text-foreground">
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
