import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useInView } from '../../../hooks/useInView'
import { prefersReducedMotion } from '../../../hooks/useHeroPlayback'
import { formatDateTime } from '../../../utils/dateUtils'
import LandingEntryCard from '../../landing/LandingEntryCard'
import { JOURNAL_ENTRIES } from '../../landing/landingStory'

/*
 * How Hindsight builds an Insights report, traced with one entry from Home's story. Stages and signals are
 * the real ones (see .scratch/product-and-updates/hindsight-map.md): each entry is read into fields, then
 * code links entries to trades, finds patterns, compares them with your own decisions, ranks and validates
 * them. Each report feeds the next. The example values are illustrative.
 *
 * Motion is one strict sequence on one clock: a section works, a line carries it to the next section, which
 * starts the moment the line arrives. The loop's arrival is the next cycle's start, so nothing waits. Nothing
 * changes size while it plays (only opacity and color), so no column ever moves.
 */

const NVDA_BUY = JOURNAL_ENTRIES.find((entry) => entry.id === 2)!
// Illustrative quote from a later NVDA entry.
const QUOTE = 'All the scrutiny on data-center spending is eating into my thesis. When do I sell?'
const QUOTE_AT = '2026-06-16T18:40:00Z'

const INPUTS = ['Journal entries', 'Trades and prices', 'News', 'Reactions and notes', 'Past reports']

// What reading the NVDA buy yields. null = the entry doesn't say, so the field stays blank.
const FIELDS: { label: string; value: string | null }[] = [
  { label: 'Reason', value: 'Data-center demand' },
  { label: 'Exit plan', value: null },
  { label: 'Time frame', value: null },
  { label: 'How sure', value: '2 of 5' },
  { label: 'Feelings', value: null },
  { label: 'Idea from', value: 'Own research' },
  { label: 'Rests on', value: 'Fundamentals' },
  { label: 'Held up', value: null },
]

const STAGES: { label: string; detail: string }[] = [
  { label: 'Link entries to trades', detail: 'This entry belongs to your Jun 3 NVDA buy.' },
  { label: 'Find patterns', detail: 'Three June buys with no exit plan.' },
  { label: 'Compare with your own decisions', detail: 'Against your May buys, which had one.' },
  { label: 'Rank by how much it mattered', detail: 'It makes your top five.' },
  { label: 'Validate patterns', detail: 'Every quote is checked against your entries.' },
]

// The cycle. Sections and lines alternate; a line lasts exactly as long as its pulse takes to travel.
const LINE_MS = 800
const PHASES = [
  { id: 'inputs', ms: 700 },
  { id: 'toEntry', ms: LINE_MS },
  { id: 'fields', ms: FIELDS.length * 200 },
  { id: 'toStages', ms: LINE_MS },
  { id: 'stages', ms: STAGES.length * 650 },
  { id: 'toOutput', ms: LINE_MS },
  { id: 'output', ms: 1400 },
  { id: 'loop', ms: 1200 },
] as const
type PhaseId = (typeof PHASES)[number]['id']
const STARTS = PHASES.map((_, i) => PHASES.slice(0, i).reduce((sum, p) => sum + p.ms, 0))
const CYCLE = STARTS[STARTS.length - 1] + PHASES[PHASES.length - 1].ms
const STEP = 50
// Sections start lighting this much before their line arrives, so their fade-in completes on arrival.
const LEAD = 120

type Position = { phase: PhaseId; index: number; progress: number }
function locate(t: number): Position {
  const wrapped = ((t % CYCLE) + CYCLE) % CYCLE
  let index = PHASES.length - 1
  while (STARTS[index] > wrapped) index--
  return { phase: PHASES[index].id, index, progress: (wrapped - STARTS[index]) / PHASES[index].ms }
}

/** The clock: where the lines are (`line`), where the sections are (`look`, LEAD ahead), and the cycle number. */
function useClock(running: boolean) {
  const reduced = prefersReducedMotion()
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!running || reduced) return
    const timer = window.setInterval(() => setElapsed((value) => value + STEP), STEP)
    return () => window.clearInterval(timer)
  }, [running, reduced])

  // Reduced motion: hold the finished report.
  const t = reduced ? STARTS[PHASES.findIndex((p) => p.id === 'output')] : elapsed
  return { line: locate(t), look: locate(t + LEAD), cycle: Math.floor(t / CYCLE) }
}

const at = (id: PhaseId) => PHASES.findIndex((p) => p.id === id)

type Box = { left: number; right: number; top: number; bottom: number; midX: number; midY: number }
type Wires = { inputs: string[]; entry: string; stages: string; loop: string } | null

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const bend = (x2 - x1) * 0.5
  return `M${x1} ${y1} C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`
}

/** Connectors measured from the real boxes (xl only, where the columns sit side by side), on resize only. */
function useWires() {
  const root = useRef<HTMLDivElement>(null)
  const inputs = useRef<(HTMLLIElement | null)[]>([])
  const entry = useRef<HTMLDivElement>(null)
  const stages = useRef<HTMLOListElement>(null)
  const output = useRef<HTMLDivElement>(null)
  const [wires, setWires] = useState<Wires>(null)

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const measure = () => {
      if (!entry.current || !stages.current || !output.current || !window.matchMedia('(min-width: 80rem)').matches) {
        setWires(null)
        return
      }
      const origin = el.getBoundingClientRect()
      const box = (node: Element): Box => {
        const r = node.getBoundingClientRect()
        const left = r.left - origin.left
        const top = r.top - origin.top
        return { left, top, right: left + r.width, bottom: top + r.height, midX: left + r.width / 2, midY: top + r.height / 2 }
      }
      const ins = inputs.current.flatMap((node) => (node ? [box(node)] : []))
      const card = box(entry.current)
      const list = box(stages.current)
      const out = box(output.current)
      const past = ins[ins.length - 1]
      // The loop runs through the bottom padding (xl:pb-12), below every column.
      const floor = origin.height - 22
      setWires({
        inputs: ins.map((b) => curve(b.right + 6, b.midY, card.left - 6, card.midY)),
        entry: curve(card.right + 6, card.midY, list.left - 6, list.midY),
        stages: curve(list.right + 6, list.midY, out.left - 6, out.midY),
        loop: `M${out.midX} ${out.bottom + 6} L${out.midX} ${floor - 12} Q${out.midX} ${floor} ${out.midX - 12} ${floor} L${past.midX + 12} ${floor} Q${past.midX} ${floor} ${past.midX} ${floor - 12} L${past.midX} ${past.bottom + 6}`,
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { root, inputs, entry, stages, output, wires }
}

/**
 * One pass along a path at constant speed, across its phase. It ends one clock step early, so a late tick
 * can never unmount it mid-travel.
 */
function Pulse({ d, ms, running }: { d: string; ms: number; running: boolean }) {
  return (
    <path d={d} pathLength={100}
      className="fill-none stroke-primary [stroke-dasharray:14_200] [stroke-linecap:round] animate-flow motion-reduce:hidden"
      strokeWidth={2}
      style={{ animationDuration: `${ms - STEP}ms`, animationTimingFunction: 'linear', animationPlayState: running ? 'running' : 'paused' }} />
  )
}

function Heading({ children }: { children: string }) {
  return <p className="mb-3 text-xs text-muted">{children}</p>
}

export default function HindsightFlow() {
  // Low threshold: stacked on phones the diagram is several screens tall.
  const { ref, inView } = useInView<HTMLDivElement>(0.1)
  const { line: now, look, cycle } = useClock(inView)
  const { index, progress } = look
  const { root, inputs, entry, stages, output: outputRef, wires } = useWires()

  const filled = index < at('fields') ? 0 : index > at('fields') ? FIELDS.length : Math.floor(progress * FIELDS.length) + 1
  const stage = index < at('stages') ? -1 : index > at('stages') ? STAGES.length : Math.floor(progress * STAGES.length)
  const reported = index >= at('output')
  const inputsLit = look.phase === 'inputs'
  const line = (id: PhaseId) => (now.phase === id ? `${cycle}-${id}` : null)

  return (
    <div ref={ref} className="select-none">
      <div ref={root} className="relative grid gap-y-8 xl:grid-cols-[8.5rem_minmax(0,15rem)_minmax(0,1fr)_minmax(0,14rem)] xl:items-center xl:gap-x-12 xl:pb-12">
        {wires && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            {[...wires.inputs, wires.entry, wires.stages].map((d) => <path key={d} d={d} className="fill-none stroke-border" strokeWidth={1} />)}
            <path d={wires.loop} className="fill-none stroke-border [stroke-dasharray:3_5]" strokeWidth={1} />
            {line('toEntry') && wires.inputs.map((d) => <Pulse key={`${line('toEntry')}${d}`} d={d} ms={LINE_MS} running={inView} />)}
            {line('toStages') && <Pulse key={line('toStages')} d={wires.entry} ms={LINE_MS} running={inView} />}
            {line('toOutput') && <Pulse key={line('toOutput')} d={wires.stages} ms={LINE_MS} running={inView} />}
            {line('loop') && <Pulse key={line('loop')} d={wires.loop} ms={PHASES[at('loop')].ms} running={inView} />}
          </svg>
        )}

        {/* Inputs */}
        <div>
          <Heading>Draws on</Heading>
          <ul className="flex flex-wrap gap-2 xl:flex-col xl:gap-3">
            {INPUTS.map((input, i) => {
              const past = i === INPUTS.length - 1
              return (
                <li key={input} ref={(node) => { inputs.current[i] = node }}
                  className={`rounded-lg border px-3 py-2 text-xs transition-colors duration-300 ${
                    inputsLit ? 'border-primary-border bg-primary-soft text-foreground' : 'border-border-subtle bg-surface text-secondary'
                  }`}>
                  {input}
                  {past && <span className="block text-[11px] text-muted">what’s changed</span>}
                </li>
              )
            })}
          </ul>
        </div>

        {/* Reads each entry */}
        <div>
          <Heading>Reads each entry</Heading>
          <div ref={entry}><LandingEntryCard entry={NVDA_BUY} time={formatDateTime(NVDA_BUY.timestamp)} /></div>
          <dl className="mt-3 grid grid-cols-2 gap-1.5">
            {FIELDS.map(({ label, value }, i) => {
              const shown = i < filled
              return (
                <div key={label}
                  className={`rounded-md border px-2 py-1.5 transition-[border-color,background-color] duration-200 ${
                    shown ? (value ? 'border-border bg-surface' : 'border-dashed border-border-subtle') : 'border-border-subtle'
                  }`}>
                  <dt className={`text-[10px] text-muted transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-40'}`}>{label}</dt>
                  {/* Always rendered, so a value appearing never changes the field's height. */}
                  <dd className={`text-xs leading-snug transition-opacity duration-200 ${value ? 'text-foreground' : 'text-muted'} ${shown ? 'opacity-100' : 'opacity-0'}`}>
                    {value ?? 'Not stated'}
                  </dd>
                </div>
              )
            })}
          </dl>
        </div>

        {/* Builds the report */}
        <div>
          <Heading>Builds your report</Heading>
          <ol ref={stages} className="relative">
            <span aria-hidden className="absolute bottom-3 left-[11px] top-3 w-px bg-border-subtle" />
            {STAGES.map(({ label }, i) => {
              const state = i < stage ? 'done' : i === stage ? 'active' : 'pending'
              return (
                <li key={label} className="relative flex items-start gap-3 pb-3 last:pb-0">
                  <span className={`relative z-10 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border text-[11px] transition-colors duration-200 ${
                    state === 'active' ? 'border-primary bg-primary-soft text-primary'
                      : state === 'done' ? 'border-primary-border bg-background text-primary' : 'border-border-subtle bg-background text-muted'
                  }`}>
                    {state === 'done'
                      ? <svg viewBox="0 0 12 12" className="h-3 w-3 fill-none stroke-current" strokeWidth={1.8}><path d="m3 6 2 2 4-4" /></svg>
                      : i + 1}
                  </span>
                  <p className={`pt-0.5 text-sm transition-colors duration-200 ${state === 'pending' ? 'text-foreground/40' : 'text-foreground'}`}>{label}</p>
                </li>
              )
            })}
          </ol>
          {/* One fixed slot for the active stage's note, shown only while the stages run; the notes cross-fade in it. */}
          <div className="mt-4 grid text-xs text-secondary">
            {STAGES.map(({ label, detail }, i) => (
              <p key={label} className={`col-start-1 row-start-1 transition-opacity duration-200 ${i === stage ? 'opacity-100' : 'opacity-0'}`}>{detail}</p>
            ))}
          </div>
        </div>

        {/* Out */}
        <div>
          <Heading>Gives you</Heading>
          <div ref={outputRef} className={`rounded-xl border bg-surface p-4 transition-[opacity,border-color] duration-300 ${
            reported ? 'border-primary-border opacity-100' : 'border-border-subtle opacity-40'
          }`}>
            <p className="text-[11px] text-primary">Insights</p>
            <p className="mt-1 text-sm font-130 text-foreground">Buying without an exit plan</p>
            <blockquote className="mt-3 border-l-2 border-border pl-2.5 text-xs text-secondary">
              {QUOTE}
              <span className="mt-0.5 block text-[10px] text-muted">{formatDateTime(QUOTE_AT)}</span>
            </blockquote>
          </div>
        </div>
      </div>
    </div>
  )
}
