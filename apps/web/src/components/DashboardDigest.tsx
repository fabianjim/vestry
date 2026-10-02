import { Link } from 'react-router-dom'
import type { DigestState } from '../types/digest'

const button = 'rounded-lg px-2 py-1 text-xs text-secondary hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed'

export default function DashboardDigest({ state, isDemo, pending, error, dismissing, onGenerate, onCheck, onDismiss, onDashboard }: {
  state?: DigestState
  isDemo: boolean
  pending: boolean
  error: boolean
  dismissing: boolean
  onGenerate: () => void
  onCheck: () => void
  onDismiss: () => void
  onDashboard: () => void
}) {
  if (state?.status === 'DISABLED' || state?.status === 'HIDDEN') return null
  const digest = state?.digest
  const working = pending || (state?.status === 'GENERATING' && !error)
  const message = working ? 'Preparing your briefing…'
    : error ? 'Could not load the briefing. Check its status before trying again.'
    : state?.status === 'FAILED' ? 'Today’s briefing could not be completed. You can try again tomorrow.'
    : state?.status === 'LIMITED' ? 'Briefing generation is unavailable right now.'
    : !state ? 'Loading briefing…'
    : state.status === 'IDLE' && !isDemo ? 'Connect recent news with your holdings and reflections.' : null
  return <section aria-label="AI portfolio briefing" aria-busy={working} className="space-y-3">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="text-sm font-130 text-foreground">Portfolio briefing <span className="text-muted text-xs font-90">· AI</span></h2>
        {digest && <time className="text-xs text-muted" dateTime={digest.generatedAt}>
          {new Date(digest.generatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </time>}
      </div>
      <div className="flex items-center gap-1">
        {!isDemo && state?.status === 'IDLE' && !error && <button className={`${button} text-primary`} disabled={working}
          onClick={onGenerate}>{digest ? 'Generate today’s briefing' : 'Generate briefing'}</button>}
        {(error || state?.status === 'LIMITED') && !working && <button className={button} onClick={onCheck}>Check again</button>}
        <button className={button} disabled={dismissing} onClick={onDismiss} aria-label="Dismiss AI briefing">
          {dismissing ? 'Hiding…' : 'Dismiss'}
        </button>
      </div>
    </div>
    {message && <p role="status" className="text-sm text-secondary">{message}</p>}
    {digest && <>
      <p className="text-sm leading-relaxed text-foreground">{digest.content.news}{' '}
        {digest.content.sources.map((source, index) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer"
          className="text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary ml-1"
          title={`${source.headline} · ${source.publishedOn}`} aria-label={`Source ${index + 1}: ${source.headline}`}>
          [{index + 1}]
        </a>)}
      </p>
      <p className="text-sm leading-relaxed text-foreground">{digest.content.reflection}</p>
      <ul className="space-y-1.5">
        {digest.content.questions.map((question, index) => <li key={index} className="text-sm">
          {question.destination === 'DASHBOARD'
            ? <button className="text-left text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary" onClick={onDashboard}>{question.text} →</button>
            : <Link className="text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary"
              to={question.destination === 'HOLDINGS' ? '/analysis' : '/journal'}>{question.text} →</Link>}
        </li>)}
      </ul>
    </>}
    <p className="text-xs text-muted">
      {isDemo ? 'Shared demo briefing · based on the original demo portfolio.' : 'Generated on request · updates once a day.'}
      {' '}{digest ? 'AI-generated; check the linked sources.' : !isDemo ? 'Generation sends a snapshot of your holdings and recent journal entries to OpenAI.' : ''}
    </p>
  </section>
}
