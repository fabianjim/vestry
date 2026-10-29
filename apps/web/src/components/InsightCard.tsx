import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { InsightPattern } from '../types/insights'
import { journalApi } from '../services/api'
import { refreshJournal } from '../services/queryUpdates'
import { getDisplayBody, parseTagsFromBody } from '../utils/tagUtils'
import { findingId, kindLabel, patternContext, patternMeasures, patternTitle } from '../utils/insights'

type Props = {
  pattern: InsightPattern
  number: number
  onOpenEntry: (entryId: number) => void
}

// One finding in the report, read like a document: what was counted, what hindsight noticed,
// the passages behind it, then a question.
export default function InsightCard({ pattern, number, onOpenEntry }: Props) {
  const title = patternTitle(pattern)
  const label = kindLabel(pattern)
  const context = patternContext(pattern)
  const measures = patternMeasures(pattern)

  return (
    <article id={findingId(number)} aria-label={title} className="min-w-0 py-8 scroll-mt-6">
      <p className="text-sm text-muted">
        <span className="text-primary tabular-nums mr-3">{String(number).padStart(2, '0')}</span>
        {label ?? context}
      </p>
      <h3 className="text-xl font-130 mt-1">{title}</h3>
      {label && context && <p className="text-sm text-muted mt-1">{context}</p>}

      {measures.length > 0 && (
        <ul className="mt-5 grid gap-x-10 gap-y-2 sm:grid-cols-2">
          {measures.map(({ lead, rest }) => (
            <li key={rest} className="flex items-baseline gap-2">
              <span className="text-2xl font-90 tabular-nums">{lead}</span>
              <span className="text-sm text-muted">{rest}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 leading-relaxed">{pattern.observation}</p>

      {pattern.citations.length > 0 && (
        <div className="mt-5">
          <p className="text-sm text-muted mb-2">From your journal</p>
          <ul className="space-y-2">
            {pattern.citations.map(citation => (
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

      <div className="mt-6">
        <p className="text-sm text-muted">A question to consider</p>
        <p className="text-lg font-90 mt-1">{pattern.question}</p>
        <InsightComposer />
      </div>
    </article>
  )
}

// A pattern spans several entries, so an answer is an insight; reflections always pair with one entry.
function InsightComposer() {
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
      setError('Please enter an insight, not just tags.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await journalApi.createEntry({ entryType: 'INSIGHT', body: parsed.body, tags: parsed.tags })
      await refreshJournal(client)
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
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => { setWriting(true); setSaved(false) }}
          className="text-sm text-link hover:text-primary-hover transition-colors pointer-coarse:min-h-[40px]">
          Write an insight →
        </button>
        {saved && <span role="status" className="text-sm text-muted">Saved to your journal</span>}
      </div>
    )
  }

  return (
    <form className="mt-3" onSubmit={e => { e.preventDefault(); save() }}>
      <label className="block text-sm text-secondary mb-2">
        Your insight
        <textarea ref={input} value={body} onChange={e => setBody(e.target.value)} maxLength={2000} rows={4}
          disabled={saving}
          className="mt-2 w-full p-3 bg-surface border border-border-control rounded-md text-sm text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-disabled-background disabled:text-disabled-foreground disabled:cursor-not-allowed" />
      </label>
      {error && <div role="alert" className="text-error text-sm mt-2">{error}</div>}
      <div className="flex gap-2 mt-3">
        <button type="submit" disabled={saving || !body.trim()}
          className="px-3 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary-hover active:bg-primary-active transition-colors disabled:bg-disabled-background disabled:text-disabled-foreground disabled:cursor-not-allowed">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" disabled={saving} onClick={() => { setWriting(false); setBody(''); setError('') }}
          className="px-3 py-2 text-sm text-secondary rounded-md hover:bg-surface-hover active:bg-surface-active transition-colors disabled:bg-disabled-background disabled:text-disabled-foreground disabled:cursor-not-allowed">
          Cancel
        </button>
      </div>
    </form>
  )
}
