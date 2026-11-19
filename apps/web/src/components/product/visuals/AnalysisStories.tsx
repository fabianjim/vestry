import { lazy, Suspense, useState, type ComponentType } from 'react'
import { ANALYSIS_STORIES, type ProductPoint } from '../productContent'

/*
 * The Analysis section's three stories: one with your own data under a caption, then two with AI side by side.
 * Each story loads only when the page needs it (the first renders Recharts and d3 cards).
 */

const AnalysisStory = lazy(() => import('./AnalysisStory'))
const BriefingStory = lazy(() => import('./BriefingStory'))
const ReflectStory = lazy(() => import('./ReflectStory'))

// Same shape as a story's app window (1040 × 640), so nothing moves when it loads.
const fallback = <div className="aspect-[1040/640] w-full rounded-xl border border-border bg-background" />
const column = 'xl:mx-auto xl:max-w-2xl'

function Story({ caption, Visual }: { caption: ProductPoint; Visual: React.ComponentType }) {
  return (
    <figure>
      <figcaption className={`mb-6 text-base leading-relaxed text-secondary ${column}`}>
        <span className="font-130 text-foreground">{caption.title}.</span> {caption.body}
      </figcaption>
      <Suspense fallback={fallback}><Visual /></Suspense>
    </figure>
  )
}

type AiStory = 'briefing' | 'reflect'

const AI_STORIES: { id: AiStory; label: string; Visual: ComponentType<{ paused?: boolean }> }[] = [
  { id: 'briefing', label: 'Portfolio Briefing story', Visual: BriefingStory },
  { id: 'reflect', label: 'Reflect with AI story', Visual: ReflectStory },
]

// From xl the pair reaches up to 4rem past the section on each side, but always stops 10rem from the
// window's edge, clear of the fixed "On this page" list.
const WIDER = 'xl:mx-[calc(-1*clamp(0px,(100vw-64rem)/2-10rem,4rem))]'

// Focusing a story widens its column; both columns animate.
const COLUMNS: Record<AiStory | 'none', string> = {
  none: 'xl:grid-cols-[1fr_1fr]',
  briefing: 'xl:grid-cols-[3fr_2fr]',
  reflect: 'xl:grid-cols-[2fr_3fr]',
}

export default function AnalysisStories() {
  // Two stories playing at once are hard to follow, so clicking one plays it alone; clicking it again plays both.
  const [focused, setFocused] = useState<AiStory | null>(null)
  const toggle = (id: AiStory) => setFocused((current) => (current === id ? null : id))

  return (
    <div className="space-y-20">
      <Story caption={ANALYSIS_STORIES.own} Visual={AnalysisStory} />
      <div>
        <h3 className={`mb-3 text-2xl font-90 tracking-tight text-foreground ${column}`}>{ANALYSIS_STORIES.aiHeading}</h3>
        <p className={`mb-10 text-sm text-muted ${column}`}>{ANALYSIS_STORIES.aiHint}</p>
        {/* Side by side once the section is wide enough (xl); stacked in the narrow column below it. */}
        <div className={`space-y-10 xl:grid xl:items-start xl:gap-6 xl:space-y-0 xl:transition-[grid-template-columns] xl:duration-500 xl:ease-out motion-reduce:transition-none ${WIDER} ${COLUMNS[focused ?? 'none']}`}>
          {AI_STORIES.map(({ id, label, Visual }) => {
            const paused = focused != null && focused !== id
            return (
              <div
                key={id}
                role="button"
                tabIndex={0}
                aria-pressed={focused === id}
                aria-label={focused === id ? `Play both stories again` : `Follow the ${label} on its own`}
                onClick={() => toggle(id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    toggle(id)
                  }
                }}
                className={`min-w-0 cursor-pointer rounded-xl transition-[opacity,box-shadow] duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  focused === id ? 'ring-1 ring-primary/50' : ''
                } ${paused ? 'opacity-50 hover:opacity-75' : 'opacity-100'}`}
              >
                <Suspense fallback={fallback}><Visual paused={paused} /></Suspense>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
