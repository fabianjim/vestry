import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import CustomizationToolbar from '../../CustomizationToolbar'
import ConcentrationCard from '../../ConcentrationCard'
import HoldingGraph from '../../HoldingGraph'
import HoldingsCardHeader from '../../HoldingsCardHeader'
import HoldingsValueChart from '../../HoldingsValueChart'
import SectorBreakdown from '../../SectorBreakdown'
import { Bars3Icon, BookOpenIcon, ChartPieIcon, DocumentCurrencyDollarIcon, DocumentMagnifyingGlassIcon, HomeIcon } from '../../icons'
import LandingEntryCard from '../../landing/LandingEntryCard'
import JournalSourceQuote from '../../JournalSourceQuote'
import { JOURNAL_STYLES, journalBadge } from '../../../constants/journalStyles'
import { useInView } from '../../../hooks/useInView'
import { prefersReducedMotion } from '../../../hooks/useHeroPlayback'
import { formatDateTime } from '../../../utils/dateUtils'
import { formatCurrency } from '../../../utils/formatUtils'
import { HOLDINGS_CARDS, type HoldingsCard, type HoldingsCardId } from '../../../utils/holdingsLayout'
import {
  AAPL_BUY, AAPL_BUY_SHARES, AAPL_PLAN, GRAPH_EDGES, GRAPH_NODES, HOLDINGS, JOURNAL_LIST, NEW_REFLECTION,
  REFLECTION_TEXT, SECTOR_DATA, VALUE_DATA,
} from './analysisStoryData'

/*
 * One investor's afternoon, played by a cursor in a scaled copy of the app: reread an old entry, rearrange
 * Holdings to check it, write a reflection. The cards are the app's real components fed fixtures; the shell,
 * journal list and detail panel reuse the app's markup. Plays only while on screen; reduced motion shows the
 * finished Holdings page.
 */

// Design size of the app window; it is scaled to fit the panel.
const W = 1040
const H = 640

type Frame = {
  ms: number
  page: 'journal' | 'holdings'
  cursor: string | null
  click: boolean
  detail: boolean
  mark: boolean
  editing: boolean
  menu: boolean
  cardMenu: boolean
  cards: HoldingsCard[]
  removing: HoldingsCardId | null
  drag: boolean
  camera: string | null
  spot: boolean
  reflecting: boolean
  typing: boolean
  saved: boolean
  fade: boolean
}

const START: HoldingsCard[] = [['sector', 1], ['value', 1], ['relationships', 2]]
const ADDED: HoldingsCard[] = [...START, ['concentration', 1]]
const REMOVED: HoldingsCard[] = ADDED.filter(([id]) => id !== 'value')
const MOVED: HoldingsCard[] = [['concentration', 1], ...REMOVED.filter(([id]) => id !== 'concentration')]
const TYPE_MS = 28

// Each step changes only what it names; everything else carries over. `click` and `fade` never carry.
const STEPS: Partial<Frame>[] = [
  { ms: 900, page: 'journal', cursor: 'start' },
  { ms: 1000, cursor: 'entry' },
  { ms: 500, click: true, detail: true },
  { ms: 700, cursor: 'plan' },
  { ms: 2200, mark: true },
  { ms: 900, cursor: 'nav-holdings' },
  { ms: 1300, click: true, page: 'holdings' },
  { ms: 800, cursor: 'customize' },
  { ms: 500, click: true, editing: true },
  { ms: 700, cursor: 'add-cards' },
  { ms: 600, click: true, menu: true },
  { ms: 700, cursor: 'option-concentration' },
  { ms: 900, click: true, cards: ADDED },
  { ms: 600, cursor: 'add-cards' },
  { ms: 700, click: true, menu: false, camera: 'card-concentration' },
  { ms: 800, cursor: 'more-value', camera: null },
  { ms: 500, click: true, cardMenu: true },
  { ms: 600, cursor: 'remove-card' },
  { ms: 350, click: true, cardMenu: false, removing: 'value' },
  { ms: 900, cards: REMOVED, removing: null, camera: 'card-concentration' },
  { ms: 800, cursor: 'grip-concentration' },
  { ms: 1100, drag: true, camera: null },
  { ms: 700, drag: false, cards: MOVED },
  { ms: 700, cursor: 'done' },
  { ms: 600, click: true, editing: false },
  { ms: 700, cursor: 'figure' },
  { ms: 2000, spot: true },
  { ms: 900, spot: false, cursor: 'nav-journal' },
  { ms: 900, click: true, page: 'journal', mark: false },
  { ms: 700, cursor: 'reflect-button' },
  { ms: 500, click: true, reflecting: true, cursor: 'textarea' },
  { ms: REFLECTION_TEXT.length * TYPE_MS + 500, typing: true },
  { ms: 600, cursor: 'save' },
  { ms: 2600, click: true, reflecting: false, typing: false, saved: true, cursor: 'new-entry' },
  { ms: 600, fade: true },
]

const FRAMES: Frame[] = STEPS.reduce<Frame[]>((frames, step) => {
  const previous = frames[frames.length - 1] ?? {
    ms: 0, page: 'journal', cursor: null, click: false, detail: false, mark: false, editing: false,
    menu: false, cardMenu: false, cards: START, removing: null, drag: false, camera: null, spot: false,
    reflecting: false, typing: false, saved: false, fade: false,
  }
  return [...frames, { ...previous, click: false, fade: false, ...step }]
}, [])

const STILL: Frame = { ...FRAMES[FRAMES.length - 1], page: 'holdings', cards: MOVED, cursor: null, fade: false, editing: false }

const control = 'rounded px-2 py-1.5 text-sm'

function useScale(designWidth: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / designWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [designWidth])
  return { ref, scale }
}

/** Offset of `el` inside `root`, ignoring transforms (so a moving camera or a card mid-FLIP doesn't skew it). */
function offsetWithin(el: HTMLElement, root: HTMLElement) {
  let x = 0
  let y = 0
  let node: HTMLElement | null = el
  while (node && node !== root) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }
  return { x, y }
}

function Cursor({ x, y, click, visible }: { x: number; y: number; click: boolean; visible: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute left-0 top-0 z-50 transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.45,0,0.2,1)] ${visible ? 'opacity-100' : 'opacity-0'}`}
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      {click && <span key={`${x}${y}`} className="absolute -left-4 -top-4 h-8 w-8 rounded-full border border-primary animate-click" />}
      <svg width="22" height="22" viewBox="0 0 22 22" className="drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]">
        <path d="M3 2.5 18 10l-6.6 1.9L8.6 18.6Z" className="fill-foreground stroke-background" strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function Sidebar({ page }: { page: Frame['page'] }) {
  const items = [
    { id: 'dashboard', icon: HomeIcon },
    { id: 'holdings', icon: ChartPieIcon },
    { id: 'transactions', icon: DocumentCurrencyDollarIcon },
    { id: 'journal', icon: BookOpenIcon },
    { id: 'insights', icon: DocumentMagnifyingGlassIcon },
  ]
  return (
    <aside className="flex w-16 shrink-0 flex-col border-r border-border-subtle bg-background-sidebar">
      <div className="flex items-center justify-center border-b border-border py-4">
        <span className="p-2 text-secondary"><Bars3Icon className="h-5 w-5" /></span>
      </div>
      <nav className="flex-1 py-4">
        {items.map(({ id, icon: Icon }) => (
          <span
            key={id}
            data-cursor={`nav-${id}`}
            className={`mx-2 flex justify-center rounded-md px-2 py-3 transition-colors duration-300 ${page === id ? 'bg-surface-active text-foreground' : 'text-secondary'}`}
          >
            <Icon className="h-5 w-5" />
          </span>
        ))}
      </nav>
    </aside>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-foreground">{children}</span>
    </div>
  )
}

function JournalPage({ frame, typed }: { frame: Frame; typed: string }) {
  const [before, after] = AAPL_BUY.body.split(AAPL_PLAN)
  return (
    <div className="flex h-full">
      <div className="w-[400px] shrink-0 overflow-hidden border-r border-border-subtle p-6">
        <h1 className="mb-5 text-xl font-130">Journal</h1>
        <div className="space-y-3">
          {frame.saved && (
            <div data-cursor="new-entry" className="animate-fade-up">
              <LandingEntryCard entry={NEW_REFLECTION} time={formatDateTime(NEW_REFLECTION.timestamp)} pulse />
            </div>
          )}
          {JOURNAL_LIST.map((entry) => (
            <div key={entry.id} data-cursor={entry.id === AAPL_BUY.id ? 'entry' : undefined}
              className={`rounded-lg transition-shadow duration-300 ${frame.detail && entry.id === AAPL_BUY.id ? 'ring-1 ring-primary' : ''}`}>
              <LandingEntryCard entry={entry} time={formatDateTime(entry.timestamp)} />
            </div>
          ))}
        </div>
      </div>

      <div className="relative min-w-0 flex-1 overflow-hidden">
        {!frame.detail && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted">Select an entry to see its details.</p>}
        <div className={`h-full p-6 transition-[opacity,transform] duration-500 ease-out ${frame.detail ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-6 opacity-0'}`}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl font-130">{AAPL_BUY.ticker}</span>
              <span className={journalBadge(AAPL_BUY.entryType)}>{JOURNAL_STYLES[AAPL_BUY.entryType].label}</span>
            </div>
            <span className="rounded-md bg-elevated px-3 py-1.5 text-sm text-foreground">Close</span>
          </div>
          <div className="mb-5 border-b border-border pb-5">
            <h4 className="mb-3 text-lg font-130">Your entry</h4>
            <div className="space-y-2">
              <Row label="Date">{formatDateTime(AAPL_BUY.timestamp)}</Row>
              <Row label="Price snapshot">{formatCurrency(AAPL_BUY.priceSnapshot!)}</Row>
              <Row label="Shares">{AAPL_BUY_SHARES}</Row>
              <Row label="Total">{formatCurrency(AAPL_BUY_SHARES * AAPL_BUY.priceSnapshot!)}</Row>
            </div>
            <p className="mt-3 text-sm text-foreground">
              {before}
              {/* A background highlight follows the sentence across line breaks. */}
              <span
                data-cursor="plan"
                className={`rounded box-decoration-clone px-0.5 transition-colors duration-700 ${frame.mark ? 'bg-primary/25 text-foreground' : 'bg-transparent'}`}
              >
                {AAPL_PLAN}
              </span>
              {after}
            </p>
          </div>

          {!frame.reflecting && !frame.typing ? (
            <div className="flex gap-2">
              <span className="rounded-md border border-border px-3 py-2 text-sm text-primary">Reflect with AI</span>
              <span data-cursor="reflect-button" className="rounded-md border border-border px-3 py-2 text-sm text-primary">Reflect on this entry</span>
            </div>
          ) : (
            <div className="animate-fade-up">
              <p className="mb-2 text-sm text-secondary">Your reflection</p>
              <JournalSourceQuote source={AAPL_BUY} />
              <div data-cursor="textarea" className="h-24 w-full rounded-md border border-border-control bg-background p-3 text-sm text-foreground ring-2 ring-primary">
                {typed}
                <span className="ml-px inline-block h-4 w-px translate-y-0.5 bg-foreground motion-safe:animate-pulse" />
              </div>
              <div className="mt-3 flex gap-2">
                <span data-cursor="save" className={`rounded-md px-3 py-2 text-sm ${typed ? 'bg-primary text-primary-foreground' : 'bg-disabled-background text-disabled-foreground'}`}>Save</span>
                <span className="rounded-md px-3 py-2 text-sm text-secondary">Cancel</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CardControls({ id, open }: { id: HoldingsCardId; open: boolean }) {
  return (
    <div className="relative flex shrink-0 items-center text-secondary">
      <span data-cursor={`grip-${id}`} className={control}>
        <svg aria-hidden className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          {[6, 12, 18].map((y) => <g key={y}><circle cx={8} cy={y} r={2} /><circle cx={16} cy={y} r={2} /></g>)}
        </svg>
      </span>
      <span data-cursor={`more-${id}`} className={`${control} ${open ? 'bg-surface-hover' : ''}`}>
        <svg aria-hidden className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">{[6, 12, 18].map((x) => <circle key={x} cx={x} cy={12} r={2} />)}</svg>
      </span>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-xl border border-foreground/5 bg-elevated p-1 shadow-floating animate-fade-up">
          {['Use large size', 'Move up', 'Move down'].map((label) => <p key={label} className={`${control} text-secondary`}>{label}</p>)}
          <p data-cursor="remove-card" className={`${control} text-foreground`}>Remove card</p>
        </div>
      )}
    </div>
  )
}

function CardBody({ id, controls }: { id: HoldingsCardId; controls: ReactNode }) {
  switch (id) {
    case 'sector': return <SectorBreakdown data={SECTOR_DATA} embedded controls={controls} />
    case 'value': return <HoldingsValueChart data={VALUE_DATA} embedded controls={controls} />
    case 'concentration':
      return <ConcentrationCard holdings={HOLDINGS} controls={controls} large={false} topN={1} onTopNChange={() => {}} disabled={false} onHoldingClick={() => {}} />
    case 'relationships':
      return (
        <div className="p-4">
          <HoldingsCardHeader title="Holding Relationships" controls={controls} />
          <HoldingGraph nodes={GRAPH_NODES} edges={GRAPH_EDGES} width={900} height={320} embedded onNodeClick={() => {}} />
        </div>
      )
    default: return null
  }
}

function HoldingsPage({ frame, gridRef, cardRefs, dragDelta, camera }: {
  frame: Frame
  gridRef: React.RefObject<HTMLDivElement | null>
  cardRefs: React.RefObject<Map<HoldingsCardId, HTMLElement>>
  dragDelta: { x: number; y: number }
  camera: number
}) {
  const shown = new Set(frame.cards.map(([id]) => id))
  return (
    <div className="h-full overflow-hidden px-6 pt-6">
      <div data-scroll className="transition-transform duration-700 ease-[cubic-bezier(0.45,0,0.2,1)]" style={{ transform: `translateY(${-camera}px)` }}>
        <CustomizationToolbar title="Holdings" editing={frame.editing}>
          {frame.editing ? (
            <>
              <span className="relative">
                <span data-cursor="add-cards" className={`${control} ${frame.menu ? 'bg-surface-hover text-foreground' : ''}`}>Add cards</span>
                {frame.menu && (
                  <div className="absolute left-0 top-full z-40 mt-2 w-64 rounded-xl border border-foreground/5 bg-elevated p-1 shadow-floating animate-fade-up">
                    {(Object.keys(HOLDINGS_CARDS) as HoldingsCardId[]).map((id) => (
                      <p key={id} data-cursor={`option-${id}`}
                        className={`flex items-center gap-2 rounded p-2 text-sm text-foreground transition-colors duration-200 ${frame.cursor === `option-${id}` ? 'bg-surface-hover' : ''}`}>
                        <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border transition-colors duration-200 ${shown.has(id) ? 'border-primary bg-primary' : 'border-border-control'}`}>
                          {shown.has(id) && <svg viewBox="0 0 12 12" className="h-3 w-3 fill-none stroke-primary-foreground" strokeWidth={2}><path d="m3 6 2 2 4-4" /></svg>}
                        </span>
                        {HOLDINGS_CARDS[id].title}
                      </p>
                    ))}
                  </div>
                )}
              </span>
              <span className={control}>Reset layout</span>
              <span aria-hidden className="mx-2 h-4 w-px bg-foreground/10" />
              <span className={control}>Cancel</span>
              <span data-cursor="done" className={`${control} ml-1 bg-foreground/10 text-foreground`}>Done</span>
            </>
          ) : (
            <span data-cursor="customize" className={control}>Customize</span>
          )}
        </CustomizationToolbar>

        <div ref={gridRef} className="relative grid grid-cols-2 items-start gap-6">
          {frame.cards.map(([id, size]) => {
            const dragging = frame.drag && id === 'concentration'
            // Once dropped, it stays above the cards still sliding out of its way.
            const dropped = !frame.drag && frame.cards === MOVED && id === 'concentration'
            const removing = frame.removing === id
            return (
              <section
                key={id}
                data-cursor={`card-${id}`}
                ref={(el) => { if (el) cardRefs.current.set(id, el); else cardRefs.current.delete(id) }}
                // transform transitions only while dragging; on drop the card must land without sliding back.
                className={`min-w-0 rounded-lg border bg-surface animate-fade-up ease-out ${
                  dragging ? 'transition-[transform,box-shadow,border-color] duration-700' : 'transition-[opacity,box-shadow,border-color,scale] duration-500'
                } ${size === 2 ? 'col-span-2' : ''} ${
                  dragging ? 'relative z-20 border-primary shadow-floating' : dropped ? 'relative z-10 border-border' : 'border-border'
                } ${removing ? 'scale-[0.97] opacity-0' : ''}`}
                style={dragging ? { transform: `translate(${dragDelta.x}px, ${dragDelta.y}px) rotate(-0.6deg)` } : undefined}
              >
                <CardBody id={id} controls={frame.editing ? <CardControls id={id} open={frame.cardMenu && id === 'value'} /> : null} />
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function AnalysisStory() {
  const { ref: viewRef, inView } = useInView<HTMLDivElement>(0.35)
  const { ref: sizeRef, scale } = useScale(W)
  const reduced = prefersReducedMotion()
  const [index, setIndex] = useState(0)
  const [typedCount, setTypedCount] = useState(0)
  const frame = reduced ? STILL : FRAMES[index]

  const rootRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const [spot, setSpot] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef(new Map<HoldingsCardId, HTMLElement>())
  const previous = useRef(new Map<HoldingsCardId, { x: number; y: number }>())
  const [cursor, setCursor] = useState({ x: 40, y: 600 })
  const [camera, setCamera] = useState(0)
  const [dragDelta, setDragDelta] = useState({ x: 0, y: 0 })

  // Advance while on screen.
  useEffect(() => {
    if (!inView || reduced) return
    const timer = window.setTimeout(() => setIndex((value) => (value + 1) % FRAMES.length), FRAMES[index].ms)
    return () => window.clearTimeout(timer)
  }, [inView, reduced, index])

  // Type the reflection; the text resets when the story starts over.
  useEffect(() => {
    if (!frame.typing) {
      if (!frame.saved) setTypedCount(0)
      return
    }
    const timer = window.setInterval(() => setTypedCount((count) => Math.min(REFLECTION_TEXT.length, count + 1)), TYPE_MS)
    return () => window.clearInterval(timer)
  }, [frame.typing, frame.saved])

  // Cards slide to new places (FLIP), measured inside the grid so the camera never reads as movement.
  useLayoutEffect(() => {
    const next = new Map<HoldingsCardId, { x: number; y: number }>()
    cardRefs.current.forEach((el, id) => {
      const now = { x: el.offsetLeft, y: el.offsetTop }
      const before = previous.current.get(id)
      if (before && !reduced && (before.x !== now.x || before.y !== now.y)) {
        el.animate([{ transform: `translate(${before.x - now.x}px, ${before.y - now.y}px)` }, { transform: 'none' }],
          { duration: 600, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
      }
      next.set(id, now)
    })
    previous.current = next
  }, [frame.cards, reduced])

  // Where the dragged card goes (the first slot), the camera, and the cursor.
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const cards = cardRefs.current
    const dragged = cards.get('concentration')
    const slot = cards.get(frame.cards[0][0])
    const delta = frame.drag && dragged && slot ? { x: slot.offsetLeft - dragged.offsetLeft, y: slot.offsetTop - dragged.offsetTop } : { x: 0, y: 0 }
    setDragDelta(delta)
    if (frame.drag && dragged) {
      // The dropped card lands where it was dragged to, so it must not slide again.
      previous.current.set('concentration', { x: dragged.offsetLeft + delta.x, y: dragged.offsetTop + delta.y })
    }

    const find = (name: string) => root.querySelector<HTMLElement>(`[data-cursor="${name}"]`)
    const cameraTarget = frame.camera ? find(frame.camera) : null
    const nextCamera = cameraTarget ? Math.max(0, offsetWithin(cameraTarget, root).y - 140) : 0
    setCamera(nextCamera)

    const figure = cards.get('concentration')?.querySelector<HTMLElement>('[aria-live="polite"]')
    if (frame.spot && figure && mainRef.current) {
      const at = offsetWithin(figure, mainRef.current)
      setSpot({ left: at.x - 10, top: at.y - nextCamera - 6, width: figure.offsetWidth + 20, height: figure.offsetHeight + 12 })
    } else {
      setSpot(null)
    }

    if (!frame.cursor) return
    if (frame.cursor === 'start') { setCursor({ x: 520, y: 560 }); return }
    const target = frame.cursor === 'figure' ? figure : find(frame.cursor)
    if (!target) return
    const at = offsetWithin(target, root)
    const inScroll = !!target.closest('[data-scroll]')
    const moving = frame.drag && frame.cursor === 'grip-concentration'
    setCursor({
      x: at.x + target.offsetWidth / 2 + (moving ? delta.x : 0),
      y: at.y + target.offsetHeight / 2 - (inScroll ? nextCamera : 0) + (moving ? delta.y : 0),
    })
  }, [frame])

  const typed = frame.saved ? REFLECTION_TEXT : REFLECTION_TEXT.slice(0, typedCount)

  return (
    <div ref={viewRef} aria-hidden className="select-none">
      <div ref={sizeRef} className="relative w-full" style={{ height: H * scale }}>
        {scale > 0 && (
          <div
            ref={rootRef}
            inert
            className={`absolute left-0 top-0 flex overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-floating transition-opacity duration-500 ${frame.fade ? 'opacity-0' : 'opacity-100'}`}
            style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          >
            <Sidebar page={frame.page} />
            <div ref={mainRef} className="relative min-w-0 flex-1">
              <div className={`absolute inset-0 transition-opacity duration-500 ${frame.page === 'journal' ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
                <JournalPage frame={frame} typed={typed} />
              </div>
              {frame.page === 'holdings' && (
                <div className="absolute inset-0 animate-fade-up">
                  <HoldingsPage frame={frame} gridRef={gridRef} cardRefs={cardRefs} dragDelta={dragDelta} camera={camera} />
                </div>
              )}
              {spot && <span className="pointer-events-none absolute z-40 rounded-lg ring-2 ring-primary/70 animate-fade-up" style={spot} />}
            </div>
            {!reduced && <Cursor x={cursor.x} y={cursor.y} click={frame.click} visible={!!frame.cursor} />}
          </div>
        )}
      </div>
    </div>
  )
}
