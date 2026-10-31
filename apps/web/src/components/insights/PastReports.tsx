import type { ReportSummary } from '../../types/insights'
import { behaviorName, behaviorTitle, consequence, reportDayLong, shownBehaviors, signedMoney } from '../../utils/insights'

type Props = {
  reports: ReportSummary[]
  hasOlder: boolean
  loadingOlder: boolean
  olderError: boolean
  onShowOlder: () => void
  onOpen: (day: string, index: number) => void
}

const QUIET = 'text-sm text-link hover:text-primary-hover transition-colors pointer-coarse:min-h-[40px] disabled:text-muted disabled:cursor-default'
const tone = (value: number) => (value < 0 ? 'text-loss' : value > 0 ? 'text-gain' : 'text-secondary')

/** A list of report dates, each expanding to its behaviors. A behavior opens the pane at its card. */
export default function PastReports({ reports, hasOlder, loadingOlder, olderError, onShowOlder, onOpen }: Props) {
  return (
    <section id="past-reports" aria-labelledby="past-reports-title" className="scroll-mt-6">
      <h2 id="past-reports-title" className="text-lg font-130">Past Reports</h2>
      {reports.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No reports yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {reports.map((report, i) => (
            <li key={report.day}>
              <details className="group" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm [&::-webkit-details-marker]:hidden pointer-coarse:min-h-[40px]">
                  {reportDayLong(report.day)}
                  <span aria-hidden="true" className="text-muted group-open:hidden">+</span>
                  <span aria-hidden="true" className="hidden text-muted group-open:inline">−</span>
                </summary>
                <ul className="pb-3">
                  {shownBehaviors(report.behaviors).map((behavior, index) => {
                    const known = consequence(behavior).group?.known
                    return (
                      <li key={`${behavior.kind}-${behavior.subject}`}>
                        <button type="button" onClick={() => onOpen(report.day, index)}
                          className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md px-2 py-2 text-left text-sm hover:bg-surface-hover transition-colors">
                          <span className="min-w-0">
                            <span className="block">{behaviorTitle(behavior)}</span>
                            <span className="text-muted">{behaviorName(behavior)}</span>
                          </span>
                          <span className="tabular-nums">
                            {known
                              ? <span className={tone(known.pnl)}>{signedMoney(known.pnl)}</span>
                              : <span className="text-muted">Results not known yet</span>}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
      {hasOlder && (
        <button type="button" onClick={onShowOlder} disabled={loadingOlder} className={`${QUIET} mt-3`}>
          {loadingOlder ? 'Loading…' : 'Show older reports'}
        </button>
      )}
      {olderError && <p role="alert" className="text-error text-sm mt-2">Older reports can’t be loaded right now.</p>}
    </section>
  )
}
