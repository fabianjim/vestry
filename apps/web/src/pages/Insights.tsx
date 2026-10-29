import { useState } from 'react'
import { Navigate, useOutletContext } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import InsightCard from '../components/InsightCard'
import JournalDetailPanel from '../components/JournalDetailPanel'
import type { LayoutContext } from '../components/Layout'
import { useInsights } from '../hooks/useInsights'
import { journalQueries } from '../services/queries'
import type { InsightsState } from '../types/insights'
import type { JournalEntry } from '../types/journal'
import { findingId, isKnownKind, journalUpTo, KIND_DESCRIPTIONS, needHint, patternTitle, type NeedHint } from '../utils/insights'

// the server answers 200 even when hindsight is down; this covers vestry itself being unreachable
const UNREACHABLE: InsightsState = { report: null, canRefresh: false, unavailable: true }
const CARD = 'rounded-lg border border-border bg-surface p-4'
const DISABLED = 'disabled:bg-disabled-background disabled:text-disabled-foreground disabled:cursor-not-allowed'
const PRIMARY = `px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary-hover active:bg-primary-active transition-colors text-sm ${DISABLED}`
const SECONDARY = `w-full px-3 py-2 bg-surface border border-border rounded-md hover:bg-surface-hover active:bg-surface-active transition-colors text-sm ${DISABLED}`
const BUILDING = 'Building your Insights. This can take a little while.'

type ViewProps = {
  state: InsightsState | undefined
  loading: boolean
  isDemo: boolean
  refreshing: boolean
  refreshError: string | null
  onRefresh: () => void
  onOpenEntry: (entryId: number) => void
}

export function InsightsView({ state, loading, isDemo, refreshing, refreshError, onRefresh, onOpenEntry }: ViewProps) {
  if (loading) return <p className="text-sm text-muted">Loading Insights…</p>

  const report = state?.report ?? null
  const patterns = report?.patterns.filter(pattern => isKnownKind(pattern.kind)) ?? []
  const needs = (report?.needs ?? []).flatMap(need => needHint(need) ?? [])
  const error = refreshError && <p role="alert" className="text-error text-sm">{refreshError}</p>
  const unavailable = state?.unavailable && (
    <p className={`${CARD} text-sm text-muted`}>Insights can't be reached right now. The rest of Vestry works as usual.</p>
  )

  if (!report) {
    return (
      <div className="lg:w-2/3 space-y-6">
        {unavailable || (
          <article aria-label="Your Insights">
            <header className="pb-6 border-b border-border">
              <h2 className="text-2xl font-90 tracking-tight">Your Insights</h2>
              <p className="text-secondary mt-2 leading-relaxed">
                Insights look across your journal and trades for patterns you may not have noticed, between what you wrote, what you did and what happened next.
              </p>
            </header>
            <ol className="divide-y divide-border border-b border-border">
              {KIND_DESCRIPTIONS.map(({ name, description }, i) => (
                <li key={name} className="flex gap-3 py-3 text-sm">
                  <span className="w-6 shrink-0 text-primary tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                  <span>
                    <span className="block">{name}</span>
                    <span className="text-muted">{description}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-3 mt-6">
              {isDemo ? (
                <p className="text-sm text-muted">The demo's Insights are being prepared.</p>
              ) : (
                <>
                  <button type="button" onClick={onRefresh} disabled={refreshing || !state?.canRefresh} className={PRIMARY}>
                    {refreshing ? 'Building…' : 'Build your Insights'}
                  </button>
                  {refreshing && <span className="text-sm text-muted">This can take a little while.</span>}
                </>
              )}
            </div>
            <About />
          </article>
        )}
        {error}
      </div>
    )
  }

  let action
  if (isDemo) {
    action = <p className="text-sm text-muted">Prepared for the demo</p>
  } else if (refreshing) {
    action = <button type="button" disabled className={SECONDARY}>Building…</button>
  } else if (state?.canRefresh) {
    action = <button type="button" onClick={onRefresh} className={SECONDARY}>Refresh</button>
  } else {
    action = <button type="button" disabled className={SECONDARY}>Refreshed today</button>
  }
  const upTo = journalUpTo(report.entriesUpTo)

  return (
    <div>
      <header className="mb-6">
        <h2 className="text-2xl font-90 tracking-tight">Your Insights</h2>
        <p className="text-sm text-muted mt-1">{refreshing ? BUILDING : upTo && `Your journal up to ${upTo}`}</p>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-10">
        <article aria-label="Your Insights" className="min-w-0 lg:col-span-2 border-t border-border">
          {unavailable && <div className="mt-6">{unavailable}</div>}
          {patterns.length > 0 ? (
            <div className="divide-y divide-border border-b border-border">
              {patterns.map((pattern, i) => (
                <InsightCard key={`${pattern.kind}-${pattern.subject}`} pattern={pattern} number={i + 1} onOpenEntry={onOpenEntry} />
              ))}
            </div>
          ) : (
            <div className="py-8 border-b border-border">
              {needs.length > 0 ? (
                <>
                  <h3 className="text-xl font-130">Not enough history yet</h3>
                  <NeedList needs={needs} />
                </>
              ) : (
                <p className="text-muted">No patterns stood out in your journal this time.</p>
              )}
            </div>
          )}
          <About />
        </article>

        {/* contents below lg, so the summary leads the page on phones and Still forming closes it */}
        <aside className="contents lg:block lg:self-start lg:sticky lg:top-6 lg:space-y-6">
          <section aria-label="This report" className={`${CARD} max-lg:order-first`}>
            <p className="flex items-baseline gap-2">
              <span className="text-3xl font-90 tabular-nums">{patterns.length}</span>
              <span className="text-sm text-muted">{patterns.length === 1 ? 'pattern' : 'patterns'} found</span>
            </p>
            <div className="mt-4 space-y-3">
              {action}
              {error}
            </div>
          </section>

          {patterns.length > 1 && (
            <nav aria-label="Findings" className={`${CARD} max-lg:hidden`}>
              <h2 className="text-sm font-130 mb-1">Findings</h2>
              <ul>
                {patterns.map((pattern, i) => (
                  <li key={`${pattern.kind}-${pattern.subject}`}>
                    <button type="button" onClick={() => document.getElementById(findingId(i + 1))?.scrollIntoView({ block: 'start' })}
                      className="flex w-full items-baseline gap-3 py-2 text-left text-sm text-secondary hover:text-foreground transition-colors">
                      <span className="w-6 shrink-0 text-primary tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                      <span className="min-w-0 truncate">{patternTitle(pattern)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {patterns.length > 0 && needs.length > 0 && (
            <section aria-label="Still forming" className={`${CARD} max-lg:order-last`}>
              <h2 className="text-sm font-130">Still forming</h2>
              <NeedList needs={needs} />
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}

function NeedList({ needs }: { needs: NeedHint[] }) {
  return (
    <ul className="divide-y divide-border">
      {needs.map(({ name, hint }) => (
        <li key={name} className="py-3 text-sm">
          <span className="block">{name}</span>
          <span className="text-muted">{hint}</span>
        </li>
      ))}
    </ul>
  )
}

const ABOUT = [
  {
    question: 'What are Insights?',
    answer: 'Patterns across your journal and trades: what you wrote, what you did and what happened next. They describe your own history and are not investment advice.',
  },
  {
    question: 'Where do the numbers come from?',
    answer: 'They are counted from your transactions and journal entries, not written by the AI. The AI writes only the observation and the question, and they never contain numbers.',
  },
  {
    question: 'Why are some patterns still forming?',
    answer: 'A pattern appears once there is enough history behind it. Still forming says what each one is waiting for.',
  },
  {
    question: 'How often does the report change?',
    answer: 'You can refresh it once a day. Each report reads your journal up to the date shown at the top.',
  },
]

function About() {
  return (
    <section aria-label="About this report" className="mt-8">
      <h3 className="text-lg font-130 mb-1">About this report</h3>
      <div className="divide-y divide-border border-b border-border">
        {ABOUT.map(({ question, answer }) => (
          <details key={question} className="group py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm [&::-webkit-details-marker]:hidden pointer-coarse:min-h-[40px]">
              {question}
              <span aria-hidden="true" className="text-muted group-open:hidden">+</span>
              <span aria-hidden="true" className="hidden text-muted group-open:inline">−</span>
            </summary>
            <p className="mt-2 max-w-prose text-sm text-muted leading-relaxed">{answer}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

export default function Insights() {
  const { isDemo } = useOutletContext<LayoutContext>()
  const client = useQueryClient()
  const { availability, available, query, refresh } = useInsights()
  const [selected, setSelected] = useState<JournalEntry | null>(null)

  if (availability.data?.available === false) return <Navigate to="/dashboard" replace />

  const openEntry = async (entryId: number) => {
    try {
      setSelected(await client.fetchQuery(journalQueries.entry(entryId)))
    } catch {
      // deleted since the report loaded; the next load marks it
    }
  }

  return (
    <div className="max-w-6xl mx-auto mt-6 px-3 mb-8">
      <InsightsView
        state={availability.isError || query.isError ? UNREACHABLE : query.data}
        loading={availability.isPending || (available && query.isPending)}
        isDemo={isDemo}
        refreshing={refresh.isPending}
        refreshError={refresh.error ? refresh.error.message : null}
        onRefresh={() => refresh.mutate()}
        onOpenEntry={openEntry}
      />
      {selected && (
        <JournalDetailPanel
          key={selected.id}
          entry={selected}
          onEntryCreated={setSelected}
          onClose={() => setSelected(null)}
          onEntryClick={setSelected}
        />
      )}
    </div>
  )
}
