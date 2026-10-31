import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Behavior, BehaviorReaction, BehaviorReport } from '../../types/insights'
import type { JournalEntry } from '../../types/journal'
import { insightsApi, journalApi } from '../../services/api'
import { refreshInsightsAll, refreshJournal } from '../../services/queryUpdates'
import { getDisplayBody, parseTagsFromBody } from '../../utils/tagUtils'
import {
  behaviorKey, behaviorName, behaviorTitle, consequence, kindFacts, signedMoney, signedPercent, sinceLast, type Result,
} from '../../utils/insights'
import { groupTrades } from '../../utils/insightCharts'
import { formatCurrency } from '../../utils/formatUtils'
import { ChevronRightIcon } from '../icons'
import Evidence from './Evidence'

type Props = {
  behavior: Behavior
  report: BehaviorReport
  titleId: string
  entries: JournalEntry[] | undefined
  onOpenEntry: (entryId: number) => void
  // the last card closes the report with what's still forming
  footnote?: ReactNode
}

const tone = (value: number) => (value < 0 ? 'text-loss' : value > 0 ? 'text-gain' : 'text-secondary')
const BUTTON = 'px-3 py-2 text-sm rounded-md transition-colors pointer-coarse:min-h-[40px] disabled:cursor-not-allowed'
const QUIET = 'text-sm text-link hover:text-primary-hover transition-colors pointer-coarse:min-h-[40px]'

// One behavior across the width: what it is and how it went against the user's own baseline on the left, what
// hindsight noticed and the passages behind it on the right, then the evidence and the user's reaction.
// Figures are worded by vestry; only the observation and question are AI text.
export default function BehaviorCard({ behavior, report, titleId, entries, onOpenEntry, footnote }: Props) {
  const { group, baseline } = consequence(behavior)
  const facts = kindFacts(behavior)
  const since = sinceLast(behavior)
  const observation = behavior.observation.trim()

  return (
    <article aria-labelledby={titleId} className="flex min-h-full min-w-0 flex-col gap-6">
      <div className="grid gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="min-w-0">
          <h3 id={titleId} className="text-2xl font-130 leading-snug">{behaviorTitle(behavior)}</h3>
          <p className="text-sm text-muted mt-1">{behaviorName(behavior)}</p>

          {(group || baseline) && (
            <div className="mt-5 divide-y divide-border border-y border-border">
              {group && <ResultRow result={group} trades={groupTrades(behavior)} />}
              {baseline && <ResultRow result={baseline} />}
            </div>
          )}

          {facts.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm text-secondary">
              {facts.map(fact => <li key={fact}>{fact}</li>)}
            </ul>
          )}
          {since && <p className="mt-3 text-sm text-muted">{since}</p>}
        </div>

        <div className="min-w-0">
          {observation && <p className="text-lg leading-relaxed">{observation}</p>}

          {behavior.citations.length > 0 && (
            <div className={observation ? 'mt-5' : ''}>
              <p className="text-sm text-muted mb-2">From your journal</p>
              <ul className="space-y-2">
                {behavior.citations.map(citation => (
                  <li key={`${citation.entryId}-${citation.quote}`}
                    className={`border-l-2 pl-3 ${citation.entryExists ? 'border-primary-border' : 'border-border'}`}>
                    {citation.entryExists ? (
                      <button type="button" onClick={() => onOpenEntry(citation.entryId)}
                        className="text-left text-secondary hover:text-foreground transition-colors pointer-coarse:min-h-[40px]">
                        “{citation.quote}”
                      </button>
                    ) : (
                      // the user deleted it, so its words aren't shown again
                      <span className="text-sm text-muted">Entry deleted</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {behavior.question.trim() && (
            <div className="mt-6">
              <p className="text-sm text-muted">A question to consider</p>
              <p className="text-lg font-90 mt-1">{behavior.question}</p>
            </div>
          )}
          {footnote}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-border pt-4">
        <Evidence report={report} behavior={behavior} entries={entries} onOpenEntry={onOpenEntry} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3 border-t border-border pt-4">
        <Reactions behavior={behavior} reportDay={report.day} />
        <NoteComposer behavior={behavior} />
      </div>
    </article>
  )
}

const tradeDay = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })

// One line closed: who, total P/L and average return. Open: how many gained, the average per decision and,
// for this group, the decisions themselves.
function ResultRow({ result, trades }: { result: Result; trades?: ReturnType<typeof groupTrades> }) {
  const { known } = result
  return (
    <details className="group/row">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-2.5 text-sm [&::-webkit-details-marker]:hidden pointer-coarse:min-h-[40px]">
        <span className="flex min-w-0 items-center gap-2 text-secondary">
          <ChevronRightIcon className="size-3.5 shrink-0 text-muted transition-transform group-open/row:rotate-90 motion-reduce:transition-none" />
          {result.label}
        </span>
        {known ? (
          <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
            <span className={`${tone(known.pnl)} font-130`}>{signedMoney(known.pnl)}</span>
            <span className={tone(known.avgReturn)}>{signedPercent(known.avgReturn)}</span>
          </span>
        ) : (
          <span className="shrink-0 text-muted">Not known yet</span>
        )}
      </summary>
      <div className="space-y-1 pb-3 pl-[22px] text-sm text-muted">
        {known ? (
          <>
            <p>{known.detail[0].toUpperCase() + known.detail.slice(1)}</p>
            <p>Total <span className={tone(known.pnl)}>{signedMoney(known.pnl)}</span>, average return{' '}
              <span className={tone(known.avgReturn)}>{signedPercent(known.avgReturn)}</span></p>
            {known.avgPnl != null && (
              <p>Average per {result.noun} <span className={tone(known.avgPnl)}>{signedMoney(known.avgPnl)}</span></p>
            )}
          </>
        ) : (
          <p>None of these has a later price yet, so how they went isn’t known.</p>
        )}
        {trades && trades.length > 0 && (
          <ul className="pt-1">
            {trades.map(t => (
              <li key={t.tradeId} className="tabular-nums">
                {tradeDay.format(Date.parse(t.date))}: {t.side === 'BUY' ? 'bought' : 'sold'} {+t.shares.toFixed(4)} {t.ticker} at {formatCurrency(t.price)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}

const REACTIONS: { reaction: BehaviorReaction; label: string }[] = [
  { reaction: 'FITS', label: 'This fits' },
  { reaction: 'DOESNT_FIT', label: 'Doesn’t fit me' },
  { reaction: 'KNEW', label: 'I knew this' },
]

// A reaction is saved as soon as it's chosen; the note beside it is optional.
function Reactions({ behavior, reportDay }: { behavior: Behavior; reportDay: string }) {
  const client = useQueryClient()
  const [reaction, setReaction] = useState<BehaviorReaction | null>(behavior.feedback?.reaction ?? null)
  const [note, setNote] = useState(behavior.feedback?.note ?? '')
  const [noteSaved, setNoteSaved] = useState(false)
  const save = useMutation({
    mutationFn: (body: { reaction: BehaviorReaction; note: string | null }) =>
      insightsApi.feedback({ kind: behavior.kind, subject: behavior.subject, reportDay, ...body }),
    onSuccess: () => refreshInsightsAll(client),
  })

  const choose = (next: BehaviorReaction) => {
    setReaction(next)
    setNoteSaved(false)
    save.mutate({ reaction: next, note: note.trim() || null })
  }

  return (
    <div className="min-w-0">
      <div role="group" aria-label="How does this fit you?" className="flex flex-wrap gap-2">
        {REACTIONS.map(option => (
          <button key={option.reaction} type="button" aria-pressed={reaction === option.reaction}
            onClick={() => choose(option.reaction)} disabled={save.isPending}
            className={`${BUTTON} border ${reaction === option.reaction
              ? 'border-primary-border bg-surface-active text-foreground'
              : 'border-border text-secondary hover:bg-surface-hover'}`}>
            {option.label}
          </button>
        ))}
      </div>
      {reaction && (
        <form className="mt-3" onSubmit={e => {
          e.preventDefault()
          save.mutate({ reaction, note: note.trim() || null }, { onSuccess: () => setNoteSaved(true) })
        }}>
          <label className="block text-sm text-secondary">
            A note, if you like
            <textarea value={note} onChange={e => { setNote(e.target.value); setNoteSaved(false) }} maxLength={500} rows={2}
              className="mt-2 w-full p-3 bg-surface border border-border-control rounded-md text-sm text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <div className="mt-2 flex items-center gap-3">
            <button type="submit" disabled={save.isPending} className={QUIET}>Save note</button>
            {noteSaved && <span role="status" className="text-sm text-muted">Saved</span>}
          </div>
        </form>
      )}
      {save.error && <p role="alert" className="text-error text-sm mt-2">{save.error.message}</p>}
    </div>
  )
}

// An INSIGHT entry linked to the behavior; hindsight reads it as context for the next report.
function NoteComposer({ behavior }: { behavior: Behavior }) {
  const client = useQueryClient()
  const [writing, setWriting] = useState(false)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (writing) input.current?.focus()
  }, [writing])

  const save = async () => {
    if (saving || !body.trim()) return
    const parsed = parseTagsFromBody(body)
    if (!getDisplayBody(parsed.body).trim()) {
      setError('Please write something, not just tags.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await journalApi.createEntry({ entryType: 'INSIGHT', body: parsed.body, tags: parsed.tags, behaviorKey: behaviorKey(behavior) })
      await Promise.all([refreshJournal(client), refreshInsightsAll(client)])
      setBody('')
      setWriting(false)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your insight')
    } finally {
      setSaving(false)
    }
  }

  if (!writing) {
    return (
      <div className="flex flex-wrap items-center gap-3 py-2">
        <button type="button" onClick={() => { setWriting(true); setSaved(false) }} className={QUIET}>
          Write about this →
        </button>
        {saved && <span role="status" className="text-sm text-muted">Saved to your journal</span>}
      </div>
    )
  }

  return (
    <form className="w-full max-w-xl" onSubmit={e => { e.preventDefault(); save() }}>
      <label className="block text-sm text-secondary mb-2">
        Your insight
        <textarea ref={input} value={body} onChange={e => setBody(e.target.value)} maxLength={2000} rows={4}
          disabled={saving}
          className="mt-2 w-full p-3 bg-surface border border-border-control rounded-md text-sm text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-disabled-background disabled:text-disabled-foreground disabled:cursor-not-allowed" />
      </label>
      {error && <div role="alert" className="text-error text-sm mt-2">{error}</div>}
      <div className="flex gap-2 mt-3">
        <button type="submit" disabled={saving || !body.trim()}
          className={`${BUTTON} bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active disabled:bg-disabled-background disabled:text-disabled-foreground`}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" disabled={saving} onClick={() => { setWriting(false); setBody(''); setError('') }}
          className={`${BUTTON} text-secondary hover:bg-surface-hover active:bg-surface-active`}>
          Cancel
        </button>
      </div>
    </form>
  )
}
