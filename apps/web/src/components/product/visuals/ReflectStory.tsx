import { useLayoutEffect, useRef, useState } from 'react'
import BriefingBar from '../../BriefingBar'
import ReflectionAidCard from '../../ReflectionAidCard'
import JournalSourceQuote from '../../JournalSourceQuote'
import { JOURNAL_STYLES, journalBadge } from '../../../constants/journalStyles'
import type { JournalEntry } from '../../../types/journal'
import { formatDateTime } from '../../../utils/dateUtils'
import { formatCurrency } from '../../../utils/formatUtils'
import {
  CAVA_AID, CAVA_REFLECTION, CAVA_REFLECTION_TEXT, DEMO_ENTRIES, NEW_CAVA_REFLECTION, STORY_NOW,
} from './aiStoryData'
import { Cursor, Row, Sidebar, StoryWindow } from './StoryParts'
import { STORY_EASE, buildFrames, centerOf, findTarget, offsetWithin, useStoryFrames, useTyped } from './storyKit'

/*
 * The investor opens an old CAVA reflection from the Dashboard, asks Reflect with AI what has happened
 * since, reads its recap and questions, and writes a new reflection. The aid card is the app's own, fed
 * the demo account's saved aid; the journal list and detail panel reuse the app's markup.
 */

type Frame = {
  ms: number
  cursor: string | null
  click: boolean
  /** What the dashboard and the detail panel scroll to; null is the top. */
  camera: string | null
  panelCamera: string | null
  detail: boolean
  pending: boolean
  aid: boolean
  reflecting: boolean
  typing: boolean
  saved: boolean
  fade: boolean
}

const TYPE_MS = 26

const STEPS: Partial<Frame>[] = [
  { ms: 900, cursor: 'start' },
  { ms: 1300, cursor: 'entry', camera: 'entry' },
  { ms: 700, click: true, detail: true },
  { ms: 800, cursor: 'reflect-ai' },
  { ms: 1000, click: true, pending: true },
  { ms: 1000, pending: false, aid: true, reflecting: true, panelCamera: 'aid', cursor: 'aid-recap' },
  { ms: 2200, cursor: 'aid-questions' },
  { ms: 2800, panelCamera: 'aid-questions' },
  { ms: 800, cursor: 'textarea', panelCamera: 'reflection' },
  { ms: CAVA_REFLECTION_TEXT.length * TYPE_MS + 600, click: true, typing: true },
  { ms: 600, cursor: 'save' },
  { ms: 900, click: true, typing: false, reflecting: false, saved: true },
  { ms: 700, cursor: 'close', panelCamera: null },
  { ms: 2800, click: true, detail: false, aid: false, camera: null, cursor: 'new-entry' },
  { ms: 600, fade: true },
]

const FRAMES = buildFrames<Frame>({
  ms: 0, cursor: null, click: false, camera: null, panelCamera: null, detail: false, pending: false,
  aid: false, reflecting: false, typing: false, saved: false, fade: false,
}, STEPS)

const STILL: Frame = {
  ...FRAMES[0], cursor: null, camera: 'entry', panelCamera: 'aid', detail: true, aid: true,
}

const VIEW_H = 640
const button = 'rounded-md border border-border px-3 py-2 text-sm text-primary'

/** One row of the Dashboard's journal panel, collapsed to its first line. */
function DashboardEntry({ entry, selected, pulse }: { entry: JournalEntry; selected: boolean; pulse: boolean }) {
  return (
    <div className={`rounded-md border bg-background p-3 transition-shadow duration-300 ${selected ? 'border-border-subtle ring-1 ring-primary' : 'border-border-subtle'} ${pulse ? 'motion-safe:animate-bg-pulse' : ''}`}>
      <div className="mb-1 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className={journalBadge(entry.entryType)}>{JOURNAL_STYLES[entry.entryType].label}</span>
          {entry.ticker && <span className="text-xs font-130 text-foreground">{entry.ticker}</span>}
        </div>
        <span className="text-xs text-muted">{formatDateTime(entry.timestamp)}</span>
      </div>
      <div className="line-clamp-1 text-sm text-foreground">{entry.body}</div>
    </div>
  )
}

function DashboardPage({ frame }: { frame: Frame }) {
  const entries = frame.saved ? [NEW_CAVA_REFLECTION, ...DEMO_ENTRIES] : DEMO_ENTRIES
  return (
    <div className="px-6 pt-6 pb-6">
      <BriefingBar expanded={false} disabled={false} onToggle={() => {}}><span /></BriefingBar>
      <h3 className="mb-4 mt-6 text-xl font-130">Journal</h3>
      <div className="rounded-lg border border-border bg-surface p-5">
        <h4 className="mb-3 text-muted">New Journal Entry</h4>
        <div className="mb-3 flex gap-3">
          <span className="rounded-md border border-border-control bg-background px-2 py-2 text-sm">Insight</span>
          <span className="w-32 rounded-md border border-border-control bg-background px-2 py-2 text-sm text-muted">Ticker (optional)</span>
        </div>
        <div className="mb-3 h-[84px] rounded-md border border-border-control bg-background p-3 text-sm text-muted">Write your thoughts... Use #tag to add tags</div>
        <span className="mb-4 inline-block rounded-md bg-disabled-background px-3 py-2 text-sm text-disabled-foreground">Save Entry</span>
        <div className="flex flex-col gap-3">
          {entries.map((entry) => (
            <div key={entry.id}
              data-cursor={entry.id === CAVA_REFLECTION.id ? 'entry' : entry.id === NEW_CAVA_REFLECTION.id ? 'new-entry' : undefined}
              className={entry.id === NEW_CAVA_REFLECTION.id ? 'animate-fade-up' : undefined}>
              <DashboardEntry entry={entry} selected={frame.detail && entry.id === CAVA_REFLECTION.id} pulse={entry.id === NEW_CAVA_REFLECTION.id} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DetailPanel({ frame, typed }: { frame: Frame; typed: string }) {
  const entry = CAVA_REFLECTION
  return (
    <div className="p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-2xl font-130">{entry.ticker}</h2>
          <span className={journalBadge(entry.entryType)}>{JOURNAL_STYLES[entry.entryType].label}</span>
        </div>
        <span data-cursor="close" className="rounded-md px-3 py-1.5 text-foreground">Close</span>
      </div>

      <div className="mb-5 border-b border-border pb-5">
        <h4 className="mb-3 text-lg font-130">Your entry</h4>
        <div className="space-y-2">
          <Row label="Date">{formatDateTime(entry.timestamp)}</Row>
          <Row label="Price snapshot">{formatCurrency(entry.priceSnapshot!)}</Row>
        </div>
        <div className="mt-3 text-sm text-foreground">{entry.body}</div>
      </div>

      <div data-cursor="aid">
        {frame.aid && (
          <div className="animate-fade-up">
            <ReflectionAidCard entry={entry} result={CAVA_AID} knownEntries={DEMO_ENTRIES} onEntryClick={() => {}} now={STORY_NOW} />
          </div>
        )}
        {!frame.reflecting && !frame.typing ? (
          <div className="flex gap-2">
            <span data-cursor="reflect-ai" className={button}>{frame.pending ? 'Reflecting…' : 'Reflect with AI'}</span>
            <span className={button}>Reflect on this entry</span>
          </div>
        ) : (
          <div data-cursor="reflection">
            <p className="mb-2 text-sm text-secondary">Your reflection</p>
            <JournalSourceQuote source={entry} />
            <div data-cursor="textarea" className="min-h-[100px] w-full rounded-md border border-border-control bg-background p-3 text-sm text-foreground ring-2 ring-primary">
              {typed}
              {frame.typing && <span className="ml-px inline-block h-4 w-px translate-y-0.5 bg-foreground motion-safe:animate-pulse" />}
            </div>
            <div className="mt-3 flex gap-2">
              <span data-cursor="save" className={`rounded-md px-3 py-2 text-sm ${typed ? 'bg-primary text-primary-foreground' : 'bg-disabled-background text-disabled-foreground'}`}>Save</span>
              <span className="rounded-md px-3 py-2 text-sm text-secondary">Cancel</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Parts of the app's own aid card, which has no cursor markers.
const AID_PARTS: Record<string, string> = {
  'aid-recap': '[data-cursor="aid"] section ul',
  'aid-questions': '[data-cursor="aid"] h5',
}

const locate = (root: HTMLElement, name: string) =>
  AID_PARTS[name] ? root.querySelector<HTMLElement>(AID_PARTS[name]) : findTarget(root, name)

/** How far a scroller's content moves to bring `name` near its top, kept within the content. */
function cameraTo(content: HTMLElement | null, name: string | null) {
  const target = content && name ? locate(content, name) : null
  if (!content || !target) return 0
  const max = Math.max(0, content.offsetHeight - VIEW_H)
  return Math.min(max, Math.max(0, offsetWithin(target, content).y - 24))
}

/** `paused` holds the story on its current frame, e.g. while the one beside it has focus. */
export default function ReflectStory({ paused = false }: { paused?: boolean }) {
  const { viewRef, reduced, frame } = useStoryFrames(FRAMES, STILL, paused)
  const rootRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState({ x: 520, y: 560 })
  const [camera, setCamera] = useState({ main: 0, panel: 0 })
  const typed = useTyped(CAVA_REFLECTION_TEXT, frame.typing, frame.saved, TYPE_MS, paused)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const main = cameraTo(mainRef.current, frame.camera)
    const panel = cameraTo(panelRef.current, frame.panelCamera)
    setCamera({ main, panel })

    if (!frame.cursor) return
    if (frame.cursor === 'start') { setCursor({ x: 520, y: 560 }); return }
    const target = locate(root, frame.cursor)
    if (!target) return
    const scroll = target.closest('[data-scroll="panel"]') ? panel : target.closest('[data-scroll="main"]') ? main : 0
    if (AID_PARTS[frame.cursor]) {
      // Reading: the cursor rests at the right end of the recap, then of the questions' heading.
      const at = offsetWithin(target, root)
      setCursor({ x: at.x + target.offsetWidth - 40, y: at.y + 12 - scroll })
      return
    }
    setCursor(centerOf(target, root, scroll))
  }, [frame])

  return (
    <StoryWindow viewRef={viewRef} rootRef={rootRef} fade={frame.fade}>
      <Sidebar page="dashboard" />
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div ref={mainRef} data-scroll="main" className={`transition-transform duration-700 ${STORY_EASE}`} style={{ transform: `translateY(${-camera.main}px)` }}>
          <DashboardPage frame={frame} />
        </div>
        {/* Hidden once it has slid out, so nothing sits past the window's edge. */}
        <div className={`absolute bottom-0 right-0 top-0 w-[440px] overflow-hidden border-l border-border bg-elevated shadow-floating transition-[transform,visibility] duration-500 ease-out ${frame.detail ? 'visible translate-x-0' : 'invisible translate-x-full'}`}>
          <div ref={panelRef} data-scroll="panel" className={`transition-transform duration-700 ${STORY_EASE}`} style={{ transform: `translateY(${-camera.panel}px)` }}>
            <DetailPanel frame={frame} typed={typed} />
          </div>
        </div>
      </div>
      {!reduced && <Cursor x={cursor.x} y={cursor.y} click={frame.click} visible={!!frame.cursor} />}
    </StoryWindow>
  )
}
