import { useLayoutEffect, useRef, useState } from 'react'
import BriefingBar from '../../BriefingBar'
import SourceMarker from '../../SourceMarker'
import LandingEntryCard from '../../landing/LandingEntryCard'
import { JOURNAL_STYLES } from '../../../constants/journalStyles'
import type { JournalEntryType } from '../../../types/journal'
import { formatDateTime } from '../../../utils/dateUtils'
import { ANT_ENTRY, ANT_TYPED, BRIEFING, DEMO_ENTRIES, IPO_SENTENCE } from './aiStoryData'
import { Cursor, Sidebar, StoryWindow } from './StoryParts'
import { buildFrames, centerOf, findTarget, useStoryFrames, useTyped } from './storyKit'

/*
 * The Portfolio Briefing points at the day's news; the investor follows its prompt to the journal and
 * writes the news down in their own words. The briefing bar is the app's own; its content and the journal
 * reuse the app's markup with the demo account's Nov 19 briefing and entries.
 */

type Frame = {
  ms: number
  page: 'dashboard' | 'journal'
  cursor: string | null
  click: boolean
  mark: boolean
  form: boolean
  menu: boolean
  entryType: JournalEntryType
  ticker: boolean
  typing: boolean
  saved: boolean
  fade: boolean
}

const TYPE_MS = 14
const TICKER_MS = 140
const TYPES: JournalEntryType[] = ['INSIGHT', 'MARKET_EVENT', 'BUY', 'SELL']

const STEPS: Partial<Frame>[] = [
  { ms: 900, page: 'dashboard', cursor: 'start' },
  { ms: 900, cursor: 'news' },
  { ms: 2400, mark: true },
  { ms: 900, cursor: 'question' },
  { ms: 1100, click: true, page: 'journal', mark: false },
  { ms: 700, cursor: 'new-entry' },
  { ms: 600, click: true, form: true },
  { ms: 700, cursor: 'type-select' },
  { ms: 600, click: true, menu: true },
  { ms: 600, cursor: 'option-MARKET_EVENT' },
  { ms: 600, click: true, menu: false, entryType: 'MARKET_EVENT' },
  { ms: 600, cursor: 'ticker' },
  { ms: 3 * TICKER_MS + 400, click: true, ticker: true },
  { ms: 600, cursor: 'body' },
  { ms: ANT_TYPED.length * TYPE_MS + 600, click: true, typing: true },
  { ms: 600, cursor: 'save' },
  { ms: 3000, click: true, form: false, typing: false, saved: true, cursor: 'saved-entry' },
  { ms: 600, fade: true },
]

const FRAMES = buildFrames<Frame>({
  ms: 0, page: 'dashboard', cursor: null, click: false, mark: false, form: false, menu: false,
  entryType: 'INSIGHT', ticker: false, typing: false, saved: false, fade: false,
}, STEPS)

const STILL: Frame = { ...FRAMES[FRAMES.length - 1], page: 'journal', cursor: null, fade: false }

const field = 'px-2 py-2 bg-background border border-border-control rounded-md text-foreground text-sm'
const focused = 'ring-2 ring-primary'
const caret = <span className="ml-px inline-block h-4 w-px translate-y-0.5 bg-foreground motion-safe:animate-pulse" />

function DashboardPage({ mark }: { mark: boolean }) {
  const { news, reflection, questions, sources } = BRIEFING.content
  const rest = news.slice(IPO_SENTENCE.length)
  return (
    <div className="h-full overflow-hidden px-6 pt-6">
      <BriefingBar expanded disabled={false} onToggle={() => {}}>
        {/* DashboardDigest's ready state, with a highlight on the sentence the investor notices. */}
        <section className="space-y-3">
          <time className="block text-xs text-muted" dateTime={BRIEFING.generatedAt}>
            {new Date(BRIEFING.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </time>
          <p className="text-sm leading-relaxed text-foreground">
            <span data-cursor="news"
              className={`rounded box-decoration-clone px-0.5 transition-colors duration-700 ${mark ? 'bg-primary/25' : 'bg-transparent'}`}>
              {IPO_SENTENCE}
            </span>
            {rest}
            <SourceMarker sources={sources.map((source) => ({ title: source.headline, url: source.url, publishedOn: source.publishedOn }))} />
          </p>
          <p className="text-sm leading-relaxed text-foreground">{reflection}</p>
          <ul className="space-y-1.5">
            {questions.map((question) => (
              <li key={question.text} className="text-sm">
                <span data-cursor="question" className="text-primary">{question.text} →</span>
              </li>
            ))}
          </ul>
        </section>
      </BriefingBar>

      <h3 className="mb-4 mt-6 text-xl font-130">Journal</h3>
      <div className="space-y-3">
        {DEMO_ENTRIES.slice(0, 4).map((entry) => (
          <LandingEntryCard key={entry.id} entry={entry} time={formatDateTime(entry.timestamp)} />
        ))}
      </div>
    </div>
  )
}

function JournalPage({ frame, ticker, typed }: { frame: Frame; ticker: string; typed: string }) {
  const entries = frame.saved ? [ANT_ENTRY, ...DEMO_ENTRIES] : DEMO_ENTRIES
  return (
    <div className="flex h-full">
      <div className="w-[440px] shrink-0 overflow-hidden border-r border-border-subtle p-6">
        <h1 className="mb-5 text-xl font-130">Journal</h1>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-muted">{entries.length} entries</span>
          <span data-cursor="new-entry" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
            {frame.form ? 'Cancel' : 'New Entry'}
          </span>
        </div>

        {frame.form && (
          <div className="mb-3 space-y-3 rounded-lg border border-border bg-surface p-4 animate-fade-up">
            <div className="flex gap-3">
              <span className="relative">
                <span data-cursor="type-select" className={`flex items-center gap-2 ${field} ${frame.menu ? focused : ''}`}>
                  {JOURNAL_STYLES[frame.entryType].label}
                  <svg aria-hidden className="h-3 w-3 text-secondary" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m4 6 4 4 4-4" /></svg>
                </span>
                {frame.menu && (
                  <div className="absolute left-0 top-full z-30 mt-1 w-40 rounded-xl border border-foreground/5 bg-elevated p-1 shadow-floating animate-fade-up">
                    {TYPES.map((type) => (
                      <p key={type} data-cursor={`option-${type}`}
                        className={`rounded p-2 text-sm transition-colors duration-200 ${frame.cursor === `option-${type}` ? 'bg-surface-hover text-foreground' : 'text-secondary'}`}>
                        {JOURNAL_STYLES[type].label}
                      </p>
                    ))}
                  </div>
                )}
              </span>
              <span data-cursor="ticker" className={`w-32 ${field} ${frame.ticker && !frame.typing ? focused : ''}`}>
                {ticker || <span className="text-muted">Ticker (optional)</span>}
                {frame.ticker && !frame.typing && caret}
              </span>
            </div>
            <div data-cursor="body" className={`min-h-[84px] ${field} p-3 ${frame.typing ? focused : ''}`}>
              {typed || <span className="text-muted">Write your thoughts... Use #tag to add tags</span>}
              {frame.typing && caret}
            </div>
            <span data-cursor="save" className={`inline-block rounded-md px-3 py-2 text-sm ${typed ? 'bg-primary text-primary-foreground' : 'bg-disabled-background text-disabled-foreground'}`}>
              Save Entry
            </span>
          </div>
        )}

        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} data-cursor={entry.id === ANT_ENTRY.id ? 'saved-entry' : undefined}
              className={entry.id === ANT_ENTRY.id ? 'animate-fade-up' : undefined}>
              <LandingEntryCard entry={entry} time={formatDateTime(entry.timestamp)} tags={entry.id === ANT_ENTRY.id} pulse={entry.id === ANT_ENTRY.id} />
            </div>
          ))}
        </div>
      </div>
      <p className="flex min-w-0 flex-1 items-center justify-center text-sm text-muted">Select an entry to see its details.</p>
    </div>
  )
}

/** `paused` holds the story on its current frame, e.g. while the one beside it has focus. */
export default function BriefingStory({ paused = false }: { paused?: boolean }) {
  const { viewRef, reduced, frame } = useStoryFrames(FRAMES, STILL, paused)
  const rootRef = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState({ x: 520, y: 560 })
  const ticker = useTyped(ANT_ENTRY.ticker!, frame.ticker, frame.saved, TICKER_MS, paused)
  const typed = useTyped(ANT_TYPED, frame.typing, frame.saved, TYPE_MS, paused)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !frame.cursor) return
    if (frame.cursor === 'start') { setCursor({ x: 520, y: 560 }); return }
    const target = findTarget(root, frame.cursor)
    if (target) setCursor(centerOf(target, root))
  }, [frame])

  return (
    <StoryWindow viewRef={viewRef} rootRef={rootRef} fade={frame.fade}>
      <Sidebar page={frame.page} />
      <div className="relative min-w-0 flex-1">
        {frame.page === 'dashboard'
          ? <div className="absolute inset-0"><DashboardPage mark={frame.mark} /></div>
          : <div className="absolute inset-0 animate-fade-up"><JournalPage frame={frame} ticker={ticker} typed={typed} /></div>}
      </div>
      {!reduced && <Cursor x={cursor.x} y={cursor.y} click={frame.click} visible={!!frame.cursor} />}
    </StoryWindow>
  )
}
