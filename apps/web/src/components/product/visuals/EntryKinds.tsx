import { useState } from 'react'
import { JOURNAL_STYLES } from '../../../constants/journalStyles'
import type { JournalEntryType } from '../../../types/journal'
import { useInView } from '../../../hooks/useInView'
import { useLoopStep } from '../../../hooks/useLoopStep'
import { formatDateTime } from '../../../utils/dateUtils'
import LandingEntryCard from '../../landing/LandingEntryCard'
import { JOURNAL_ENTRIES } from '../../landing/landingStory'

const INTERVAL = 4200

const KINDS: { type: JournalEntryType; line: string }[] = [
  { type: 'BUY', line: 'Why you bought, at the price you paid.' },
  { type: 'SELL', line: 'What changed, and what it earned or cost.' },
  { type: 'INSIGHT', line: 'A thesis or an idea, before any trade.' },
  { type: 'MARKET_EVENT', line: 'What the market did, in your words.' },
  { type: 'REFLECTION', line: 'Looking back on an earlier entry.' },
]

// One entry per kind from Home's story, so the tickers and prices agree across pages.
const EXAMPLES = KINDS.map(({ type }) => JOURNAL_ENTRIES.find((entry) => entry.entryType === type)!)

/** The five kinds of entry side by side; one is in focus at a time and the focus moves on by itself. */
export default function EntryKinds() {
  const { ref, inView } = useInView<HTMLDivElement>(0.4)
  const [hovered, setHovered] = useState(false)
  const { step, select, auto } = useLoopStep(KINDS.length, INTERVAL, inView && !hovered)
  const entry = EXAMPLES[step]

  return (
    <div ref={ref} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <div role="tablist" aria-label="Kinds of entry" className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
        {KINDS.map(({ type }, index) => {
          const active = index === step
          return (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => select(index)}
              className={`relative overflow-hidden rounded border px-2.5 py-1.5 text-xs sm:px-3 font-130 transition-all duration-300 cursor-pointer ${
                active ? `${JOURNAL_STYLES[type].badge} scale-105` : 'border-border-subtle text-foreground/40 hover:text-foreground/75'
              }`}
            >
              {JOURNAL_STYLES[type].label}
              {active && auto && (
                // A thin fill shows when the focus will move on; the key restarts it on every step.
                <span
                  key={step}
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-px origin-left bg-current opacity-60 animate-[fill_linear_both]"
                  style={{ animationDuration: `${INTERVAL}ms` }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Every card sits in the same grid cell, so the panel keeps the tallest card's height and nothing below moves. */}
      <div className="mx-auto mt-8 grid max-w-xl" role="tabpanel" aria-label={JOURNAL_STYLES[entry.entryType].label}>
        {EXAMPLES.map((example, index) => {
          const active = index === step
          return (
            <div
              key={example.id}
              aria-hidden={!active}
              className={`col-start-1 row-start-1 transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none ${
                active ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-1.5 opacity-0'
              }`}
            >
              <p className="mb-4 text-center text-sm text-secondary">{KINDS[index].line}</p>
              <LandingEntryCard entry={example} time={formatDateTime(example.timestamp)} tags />
            </div>
          )
        })}
      </div>
    </div>
  )
}
