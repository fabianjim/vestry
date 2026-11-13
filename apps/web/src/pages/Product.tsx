import { lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import LandingNav from '../components/landing/LandingNav'
import LandingFooter from '../components/landing/LandingFooter'
import LandingCTA from '../components/landing/LandingCTA'
import { OnThisPageList, OnThisPageMenu } from '../components/product/OnThisPage'
import { PRODUCT_SECTIONS, type ProductSection } from '../components/product/productContent'
import { useActiveSection } from '../hooks/useActiveSection'
import { useDemoLogin } from '../hooks/useDemoLogin'
import EntryKinds from '../components/product/visuals/EntryKinds'
import HindsightFlow from '../components/product/visuals/HindsightFlow'

const SECTION_IDS = PRODUCT_SECTIONS.map((section) => section.id)
// Must sit just below where a jumped-to section lands (scroll-mt-32 / lg:scroll-mt-24), so a jump makes it current.
const ACTIVE_LINE = 140

// The story renders real Holdings cards (Recharts and d3), so it loads only when the page needs it.
const AnalysisStory = lazy(() => import('../components/product/visuals/AnalysisStory'))

const VISUALS: Record<string, React.ComponentType> = {
  journal: EntryKinds,
  analysis: AnalysisStory,
  hindsight: HindsightFlow,
}

const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'

const CENTERED_LINE = 'xl:relative xl:left-1/2 xl:w-max xl:-translate-x-1/2 xl:whitespace-nowrap xl:text-center'

// Visuals that already draw their own frame (the story is a full app window), so they sit on the page without the panel.
const BARE = new Set(['analysis'])

function VisualPanel({ Visual, bare = false }: { Visual: React.ComponentType; bare?: boolean }) {
  if (bare) {
    return (
      <Suspense fallback={<div className="aspect-[1040/640] w-full rounded-xl border border-border bg-background" />}>
        <Visual />
      </Suspense>
    )
  }
  return (
    <div className="relative overflow-hidden rounded-2xl border border-foreground/5 bg-surface/40 px-5 py-10 sm:px-10 sm:py-14">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-2/3 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative">
        {/* Same shape as the story's app window (1040 × 640), so nothing moves when it loads. */}
        <Suspense fallback={<div className="aspect-[1040/640] w-full rounded-xl border border-border bg-background" />}>
          <Visual />
        </Suspense>
      </div>
    </div>
  )
}

function Points({ section, className = '' }: { section: ProductSection; className?: string }) {
  if (section.points.length === 0) return null
  return (
    <ul className={`space-y-5 ${className}`}>
      {section.points.map((point) => (
        <li key={point.title} className="text-base leading-relaxed text-secondary">
          <span className="font-130 text-foreground">{point.title}.</span> {point.body}
        </li>
      ))}
    </ul>
  )
}

/*
 * Layouts. Below xl every section is one 672px column. From xl every section is 1024px wide (which only
 * clears the fixed "On this page" list from xl), so all labels share a left edge:
 * - default: the headline is one line centered on the page; text stays in a centered 672px column and the
 *   visual spans the full width.
 * - split: label and headline on the left, vertically centered; lede and points on the right.
 * - side: the centered headline on top, then the lede on the left and the visual on the right.
 */
function Section({ section, first }: { section: ProductSection; first: boolean }) {
  const Heading = first ? 'h1' : 'h2'
  const Visual = VISUALS[section.id]
  const layout = section.layout ?? 'default'
  const label = <p className="mb-4 text-sm font-130 text-primary">{section.label}</p>
  const headline = (extra: string) => (
    <Heading id={`${section.id}-heading`} className={`mb-5 text-3xl md:text-4xl font-90 tracking-tight text-foreground ${extra}`}>
      {section.headline}
    </Heading>
  )
  const lede = <p className="text-lg leading-relaxed text-secondary">{section.lede}</p>

  return (
    <section
      id={section.id}
      aria-labelledby={`${section.id}-heading`}
      className="mx-auto max-w-2xl scroll-mt-32 lg:scroll-mt-24 xl:max-w-5xl"
    >
      {layout === 'split' && (
        <div className="xl:grid xl:grid-cols-[5fr_7fr] xl:items-center xl:gap-16">
          <div>
            {label}
            {headline('xl:mb-0 xl:text-5xl xl:leading-tight')}
          </div>
          <div>
            {lede}
            <Points section={section} className="mt-10" />
            {section.link && (
              <Link to={section.link.to} className="mt-8 inline-block text-sm text-primary transition-colors hover:text-foreground">
                {section.link.label} →
              </Link>
            )}
          </div>
        </div>
      )}

      {layout === 'side' && (
        <>
          {label}
          {headline(CENTERED_LINE)}
          <div className="xl:mt-10 xl:grid xl:grid-cols-[2fr_3fr] xl:items-center xl:gap-14">
            {lede}
            {Visual && <div className="mt-14 xl:mt-0"><VisualPanel Visual={Visual} /></div>}
          </div>          <Points section={section} className="mt-12" />
        </>
      )}

      {layout === 'default' && (
        <>
          {label}
          {headline(CENTERED_LINE)}
          <div className="xl:mx-auto xl:max-w-2xl">{lede}</div>
          {Visual && <div className="mt-14"><VisualPanel Visual={Visual} bare={BARE.has(section.id)} /></div>}
          <div className="xl:mx-auto xl:max-w-2xl">
            <Points section={section} className="mt-12" />
          </div>
        </>
      )}
    </section>
  )
}

export default function Product() {
  const { start, loading, error } = useDemoLogin()
  const [demoLocation, setDemoLocation] = useState<'nav' | 'cta' | null>(null)
  const active = useActiveSection(SECTION_IDS, ACTIVE_LINE)

  const openDemo = (location: 'nav' | 'cta') => {
    setDemoLocation(location)
    void start()
  }

  useEffect(() => {
    document.title = 'Product | Vestry'
    const target = window.location.hash && document.getElementById(window.location.hash.slice(1))
    if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' })
    else window.scrollTo(0, 0)
  }, [])

  const goTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
    window.history.replaceState(null, '', `#${id}`)
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <LandingNav onDemoClick={() => openDemo('nav')} loading={loading} error={demoLocation === 'nav' ? error : null} />

      <main className="pt-14">
        <div className="sticky top-14 z-40 bg-background/80 backdrop-blur-sm lg:hidden">
          <OnThisPageMenu sections={PRODUCT_SECTIONS} active={active} onSelect={goTo} />
        </div>

        {/* Fixed to the left edge and vertically centered, like Home's section markers. */}
        <div className="fixed left-8 top-1/2 z-30 hidden -translate-y-1/2 lg:block">
          <OnThisPageList sections={PRODUCT_SECTIONS} active={active} onSelect={goTo} />
        </div>

        <div className="space-y-32 px-6 pt-10 lg:pt-20">
          {PRODUCT_SECTIONS.map((section, index) => (
            <Section key={section.id} section={section} first={index === 0} />
          ))}
        </div>

        <div className="px-6 py-32">
          <LandingCTA onDemoClick={() => openDemo('cta')} loading={loading} error={demoLocation === 'cta' ? error : null} />
        </div>
      </main>

      <LandingFooter />
    </div>
  )
}
