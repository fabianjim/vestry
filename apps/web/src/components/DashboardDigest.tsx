import { Link } from 'react-router-dom'
import type { DigestState } from '../types/digest'

const button = 'ml-auto rounded-lg px-2 py-1 text-xs text-secondary hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed'

export default function DashboardDigest({ state, isDemo, pending, error, onGenerate, onCheck, onDashboard }: {
  state?: DigestState
  isDemo: boolean
  pending: boolean
  error: boolean
  onGenerate: () => void
  onCheck: () => void
  onDashboard: () => void
}) {
  if (state?.status === 'DISABLED' || state?.status === 'HIDDEN') return null
  const digest = state?.digest
  const working = pending || (state?.status === 'GENERATING' && !error)
  const message = working ? 'Preparing your briefing…'
    : error ? 'Could not load the briefing. Check its status before trying again.'
    : state?.status === 'FAILED' ? (isDemo ? 'The latest demo briefing could not be completed. Another attempt is scheduled for the next weekday at 10 a.m. New York time.' : 'Today’s briefing could not be completed. You can try again tomorrow.')
    : state?.status === 'LIMITED' ? 'Briefing generation is unavailable right now.'
    : !state ? 'Loading briefing…'
    : state.status === 'IDLE' ? (isDemo ? (digest ? null : 'The demo briefing is prepared at 10 a.m. New York time on weekdays.') : 'Connect recent news with your holdings and reflections.') : null
  return <section aria-label="Portfolio briefing content" aria-busy={working} className="space-y-3">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      {digest && <time className="text-xs text-muted" dateTime={digest.generatedAt}>
        {new Date(digest.generatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
      </time>}
      {!isDemo && state?.status === 'IDLE' && !error && <button className={`${button} text-primary`} disabled={working}
        onClick={onGenerate}>{digest ? 'Generate today’s briefing' : 'Generate briefing'}</button>}
      {(error || state?.status === 'LIMITED') && !working && <button className={button} onClick={onCheck}>Check again</button>}
    </div>
    {message && <p role="status" className="text-sm text-secondary">{message}</p>}
    {digest && <>
      <p className={digest.content.newsStatus === 'READY' ? 'text-sm leading-relaxed text-foreground' : 'text-xs text-muted'}>{digest.content.news}{' '}
        {digest.content.sources.map((source, index) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer"
          className="text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary ml-1"
          title={source.publishedOn ? `${source.headline}  ${source.publishedOn}` : source.headline} aria-label={`Source ${index + 1}: ${source.headline}`}>
          [{index + 1}]
        </a>)}
      </p>
      {digest.content.reflection && <p className="text-sm leading-relaxed text-foreground">{digest.content.reflection}</p>}
      <ul className="space-y-1.5">
        {digest.content.questions.map((question, index) => <li key={index} className="text-sm">
          {question.destination === 'DASHBOARD'
            ? <button className="text-left text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary" onClick={onDashboard}>{question.text} →</button>
            : <Link className="text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary"
              to={question.destination === 'HOLDINGS' ? '/analysis' : '/journal'}>{question.text} →</Link>}
        </li>)}
      </ul>
    </>}
  </section>
}
