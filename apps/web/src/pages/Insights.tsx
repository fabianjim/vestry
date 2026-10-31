import { useEffect, useRef, useState } from 'react'
import { Navigate, useOutletContext } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import BehaviorPane from '../components/insights/BehaviorPane'
import PastReports from '../components/insights/PastReports'
import JournalDetailPanel from '../components/JournalDetailPanel'
import type { LayoutContext } from '../components/Layout'
import { useInsights } from '../hooks/useInsights'
import { insightsApi } from '../services/api'
import { journalQueries } from '../services/queries'
import type { InsightsOverview, ReportSummary } from '../types/insights'
import type { JournalEntry } from '../types/journal'
import { blockedReason, FAILED_TODAY, needHint } from '../utils/insights'

export type Pane = { kind: 'generating' } | { kind: 'report'; day: string; index: number } | null

// the demo's Generate is played in the browser; visitors never cause a model call
export const DEMO_LOAD_MS = 2000
const CARD = 'rounded-lg border border-border bg-surface p-4'
const DISABLED = 'disabled:bg-disabled-background disabled:text-disabled-foreground disabled:cursor-not-allowed'
const PRIMARY = `px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary-hover active:bg-primary-active transition-colors text-sm pointer-coarse:min-h-[40px] ${DISABLED}`
const SECONDARY = 'px-3 py-2 border border-border text-foreground rounded-md hover:bg-surface-hover transition-colors text-sm pointer-coarse:min-h-[40px]'
const UNAVAILABLE = 'Insights can’t be reached right now. The rest of Vestry works as usual.'

type ViewProps = {
  overview: InsightsOverview | undefined
  unreachable: boolean
  loading: boolean
  isDemo: boolean
  // the demo's Generate was played this visit, so it offers the report it opened
  demoGenerated: boolean
  pane: Pane
  generating: boolean
  generateError: string | null
  reports: ReportSummary[]
  hasOlder: boolean
  loadingOlder: boolean
  olderError: boolean
  entries: JournalEntry[] | undefined
  onGenerate: () => void
  onOpen: (day: string, index: number) => void
  onPaneIndex: (index: number) => void
  onClosePane: () => void
  onViewPast: () => void
  onShowOlder: () => void
  onOpenEntry: (entryId: number) => void
}

export function InsightsView(props: ViewProps) {
  const { overview, unreachable, loading, isDemo, pane, generating, generateError, reports } = props
  if (loading) return <p className="text-sm text-muted">Loading Insights…</p>
  if (unreachable || !overview || overview.unavailable) {
    return (
      <div className="space-y-6">
        <Intro />
        <p className={`${CARD} text-sm text-muted`}>{UNAVAILABLE}</p>
      </div>
    )
  }

  const latest = reports[0]
  const building = generating || overview.status === 'GENERATING'
  let action
  let reason: string | null = null
  const viewCurrent = latest && (
    <button type="button" onClick={() => props.onOpen(latest.day, 0)} className={SECONDARY}>View current report</button>
  )
  if (isDemo) {
    if (!latest) reason = 'The demo’s report is being prepared.'
    else if (props.demoGenerated && !building) action = viewCurrent
    else action = <button type="button" onClick={props.onGenerate} disabled={building} className={PRIMARY}>{building ? 'Generating…' : 'Generate report'}</button>
  } else if (building) {
    action = <button type="button" disabled className={PRIMARY}>Generating…</button>
  } else if (overview.canGenerate) {
    action = <button type="button" onClick={props.onGenerate} className={PRIMARY}>Generate report</button>
  } else if (latest) {
    action = viewCurrent
    reason = overview.status === 'FAILED_TODAY' ? null : blockedReason(overview.blockedReason, latest)
  } else {
    action = <button type="button" disabled className={PRIMARY}>Generate report</button>
  }

  const lastRun = !building && overview.lastRun
  const needs = lastRun && lastRun.outcome === 'EMPTY' ? lastRun.needs.flatMap(need => needHint(need) ?? []) : []

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5 border-b border-border pb-8">
        <div className="min-w-0 max-w-2xl"><Intro /></div>
        <div className="flex flex-wrap items-center gap-3">
          {reason && <span className="text-sm text-muted">{reason}</span>}
          {action}
        </div>
      </header>
      <div className="empty:hidden -mt-6 space-y-2">
        {!building && overview.status === 'FAILED_TODAY' && <p role="status" className="text-sm text-muted">{FAILED_TODAY}</p>}
        {lastRun && lastRun.outcome === 'UNAVAILABLE' && (
          <p role="status" className="text-sm text-muted">The report couldn’t be generated right now. Nothing was lost; please try again later.</p>
        )}
        {generateError && <p role="alert" className="text-error text-sm">{generateError}</p>}
      </div>

      {lastRun && lastRun.outcome === 'EMPTY' && (
        <section aria-label="Still forming" className={CARD}>
          <h2 className="font-130">Nothing stands out yet</h2>
          <p className="text-sm text-muted mt-1">A behavior appears once there’s enough history behind it.</p>
          {needs.length > 0 && (
            <ul className="mt-2 divide-y divide-border">
              {needs.map(({ name, hint }) => (
                <li key={`${name}-${hint}`} className="py-3 text-sm">
                  <span className="block">{name}</span>
                  <span className="text-muted">{hint}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {pane && (
        <BehaviorPane mode={pane} entries={props.entries}
          onIndex={props.onPaneIndex} onClose={props.onClosePane} onViewPast={props.onViewPast} onOpenEntry={props.onOpenEntry} />
      )}

      <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <PastReports reports={reports} hasOlder={props.hasOlder} loadingOlder={props.loadingOlder} olderError={props.olderError}
          onShowOlder={props.onShowOlder} onOpen={props.onOpen} />
        <About />
      </div>
    </div>
  )
}

function Intro() {
  return (
    <>
      <h1 className="text-2xl font-90 tracking-tight">Insights</h1>
      <p className="text-secondary mt-2 leading-relaxed max-w-prose">
        A short report on habits in your own decisions: what you did, what you wrote, and how it went compared with the rest of your history.
      </p>
    </>
  )
}

const ABOUT = [
  {
    question: 'What are Insights?',
    answer: 'Up to five behaviors found in your journal and trades, each set against the rest of your own history. They describe what happened, and are not investment advice.',
  },
  {
    question: 'Where do the numbers come from?',
    answer: 'They are counted from your transactions, stored prices and journal entries, not written by the AI. The AI writes only the observation and the question, and they never contain numbers.',
  },
  {
    question: 'Why are some results not known yet?',
    answer: 'A result needs a later price. Gains are counted only among decisions that have one, so a group with none shows its results as not known yet.',
  },
  {
    question: 'How often can I generate a report?',
    answer: 'At most once a day, and only when a trade, an entry or your feedback has changed since the last one. Past reports stay readable.',
  },
]

function About() {
  return (
    <section aria-label="About Insights">
      <h2 className="text-lg font-130 mb-1">About Insights</h2>
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
  const { availability, available, overview, generate } = useInsights()
  const [pane, setPane] = useState<Pane>(null)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoGenerated, setDemoGenerated] = useState(false)
  const [selected, setSelected] = useState<JournalEntry | null>(null)
  const [older, setOlder] = useState<{ reports: ReportSummary[]; hasOlder: boolean } | null>(null)
  // the newest report when Generate was clicked, so a new one can be told apart
  const latestAtClick = useRef<string | null | undefined>(undefined)
  const returnFocus = useRef<HTMLElement | null>(null)
  const entries = useQuery({ ...journalQueries.entries(), enabled: pane?.kind === 'report' })
  const loadOlder = useMutation({
    mutationFn: async (before: string) => {
      const page = await insightsApi.olderReports(before)
      if (page.unavailable) throw new Error('unavailable')
      return page
    },
    onSuccess: page => setOlder(prev => ({ reports: [...(prev?.reports ?? []), ...page.reports], hasOlder: page.hasOlder })),
  })

  const data = overview.data
  const reports = [...(data?.reports ?? []), ...(older?.reports ?? [])]

  // a real generate ends when the POST and the overview's GENERATING have both settled
  useEffect(() => {
    if (isDemo || pane?.kind !== 'generating' || generate.isPending || !data || data.status === 'GENERATING') return
    const newest = data.reports[0]?.day ?? null
    setPane(!generate.isError && newest && newest !== latestAtClick.current ? { kind: 'report', day: newest, index: 0 } : null)
  }, [isDemo, pane, generate.isPending, generate.isError, data])

  useEffect(() => {
    if (!demoLoading) return
    const timer = setTimeout(() => {
      setDemoLoading(false)
      setDemoGenerated(true)
      const newest = data?.reports[0]?.day
      setPane(newest ? { kind: 'report', day: newest, index: 0 } : null)
    }, DEMO_LOAD_MS)
    return () => clearTimeout(timer)
  }, [demoLoading, data])

  if (availability.data?.available === false) return <Navigate to="/dashboard" replace />

  const rememberTrigger = () => {
    if (!pane && document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement
  }
  const onGenerate = () => {
    rememberTrigger()
    setPane({ kind: 'generating' })
    if (isDemo) {
      setDemoLoading(true)
      return
    }
    latestAtClick.current = data?.reports[0]?.day ?? null
    generate.mutate()
  }
  const closePane = () => {
    setPane(null)
    setDemoLoading(false)
    returnFocus.current?.focus()
    returnFocus.current = null
  }
  const openEntry = async (entryId: number) => {
    try {
      setSelected(await client.fetchQuery(journalQueries.entry(entryId)))
    } catch {
      // deleted since the report loaded; the next load marks it
    }
  }

  return (
    <div className="mt-6 mb-8 px-3 md:pr-8">
      <InsightsView
        overview={data}
        unreachable={availability.isError || overview.isError}
        loading={availability.isPending || (available && overview.isPending)}
        isDemo={isDemo}
        demoGenerated={demoGenerated}
        pane={pane}
        generating={generate.isPending || demoLoading}
        generateError={generate.error && !generate.isPending ? generate.error.message : null}
        reports={reports}
        hasOlder={older ? older.hasOlder : !!data?.hasOlder}
        loadingOlder={loadOlder.isPending}
        olderError={loadOlder.isError}
        entries={entries.data}
        onGenerate={onGenerate}
        onOpen={(day, index) => { rememberTrigger(); setPane({ kind: 'report', day, index }) }}
        onPaneIndex={index => setPane(current => (current?.kind === 'report' ? { ...current, index } : current))}
        onClosePane={closePane}
        onViewPast={() => {
          setPane(null)
          returnFocus.current = null
          // after the view has left and the page can scroll again
          requestAnimationFrame(() => document.getElementById('past-reports')?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
        }}
        onShowOlder={() => { const before = reports[reports.length - 1]?.day; if (before) loadOlder.mutate(before) }}
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
