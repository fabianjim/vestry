import { useMemo } from 'react'
import type { Behavior, BehaviorReport } from '../../types/insights'
import type { JournalEntry } from '../../types/journal'
import { evidenceTimeline } from '../../utils/insights'
import BehaviorVisual, { AXIS_WIDTH } from './BehaviorVisual'

type Props = {
  report: BehaviorReport
  behavior: Behavior
  entries: JournalEntry[] | undefined
  onOpenEntry: (entryId: number) => void
}

// What the behavior looked like over time: a chart chosen for its kind, then a mark on each day whose entries it
// quoted, on the same months. A mark sits where its day falls in the month; selecting it opens the entry.
export default function Evidence({ report, behavior, entries, onOpenEntry }: Props) {
  const { months, marks } = useMemo(() => evidenceTimeline(entries ?? [], report, behavior), [entries, report, behavior])

  return (
    <section aria-label="Evidence" className="flex min-h-0 flex-1 flex-col">
      <h3 className="text-sm font-130">Evidence</h3>
      <BehaviorVisual behavior={behavior} months={months} />
      {/* the strip and months stop where the chart's plot does */}
      <div style={{ paddingRight: AXIS_WIDTH }}>
      <div className="relative mt-1 h-4" aria-label="Entries quoted" role="group">
        <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-border" />
        {marks.map(mark => (
          <button key={mark.date} type="button" aria-label={mark.label} title={mark.label}
            onClick={() => onOpenEntry(mark.entryIds[0])}
            style={{ left: `${mark.position * 100}%` }}
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-primary hover:bg-primary-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground pointer-coarse:size-4" />
        ))}
      </div>
      <ol aria-hidden="true" className="mt-1.5 flex">
        {months.map(month => (
          <li key={month.key} className="min-w-0 flex-1 border-l border-border pl-1.5 text-xs text-muted truncate">{month.label}</li>
        ))}
      </ol>
      </div>
      {entries && marks.length === 0 && <p className="mt-2 text-sm text-muted">No journal entries quoted for this one.</p>}
    </section>
  )
}
