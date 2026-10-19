import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../services/api'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { useLandingNavigation } from '../hooks/useLandingNavigation'
import { useDemoLogin } from '../hooks/useDemoLogin'
import LandingNav from '../components/landing/LandingNav'
import LandingChart from '../components/landing/LandingChart'
import LandingJournal from '../components/landing/LandingJournal'
import LandingDetailCard from '../components/landing/LandingDetailCard'
import LandingCTA from '../components/landing/LandingCTA'
import { GithubIcon, EnvelopeIcon } from '../components/icons'

const SECTIONS = ['track', 'reflect', 'analyze', 'improve']

function RevealSection({ children, className }: { children: React.ReactNode; className?: string }) {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>()

  return (
    <div
      ref={ref}
      className={`
        transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}
        ${className || ''}
      `}
    >
      {children}
    </div>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState(0)
  const [demoLocation, setDemoLocation] = useState<'nav' | 'cta' | null>(null)
  const { start, loading, error } = useDemoLogin()
  const sectionRefs = useRef<(HTMLElement | null)[]>([])

  useLandingNavigation(true)

  const openDemo = (location: 'nav' | 'cta') => {
    setDemoLocation(location)
    void start()
  }

  useEffect(() => {
    let active = true
    document.title = 'Vestry | Portfolio Journal'

    const checkAuth = async () => {
      try {
        const data = await authApi.sessionStatus()
        if (active && data.authenticated) {
          navigate('/dashboard', { replace: true })
        }
      } catch {
        // If the session check fails, keep the public landing page available.
      }
    }

    checkAuth()
    return () => { active = false }
  }, [navigate])

  useEffect(() => {
    const observers: IntersectionObserver[] = []

    sectionRefs.current.forEach((el, index) => {
      if (!el) return

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveSection(index)
          }
        },
        { threshold: 0.5 }
      )

      observer.observe(el)
      observers.push(observer)
    })

    return () => observers.forEach((o) => o.disconnect())
  }, [])

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'start',
      })
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav onDemoClick={() => openDemo('nav')} loading={loading} error={demoLocation === 'nav' ? error : null} />

      <div className="fixed left-6 top-1/2 -translate-y-1/2 z-40 hidden md:flex flex-col gap-4">
        {SECTIONS.map((id, index) => (
          <button
            type="button"
            key={id}
            onClick={() => scrollTo(id)}
            className="group relative py-2 cursor-pointer"
            aria-label={`Go to ${id} section`}
            aria-current={index === activeSection ? 'true' : undefined}
          >
            <span className={`block h-[2px] rounded-full transition-all duration-300
              ${index === activeSection
                ? 'w-8 bg-primary'
                : 'w-4 bg-foreground/30 group-hover:bg-foreground/60 group-focus-visible:bg-foreground/60'
              }
            `} />
            <span aria-hidden="true" className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 text-xs text-muted capitalize opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">{id}</span>
          </button>
        ))}
      </div>

      <main className="pt-14">
        {/* Track */}
        <section
          data-landing-stop
          id="track"
          ref={(el) => { sectionRefs.current[0] = el }}
          className="min-h-[calc(100svh-3.5rem)] flex flex-col justify-center px-6 py-16"
        >
          {/* The hero renders at once; its chart playback is the entrance. */}
          <div className="max-w-4xl mx-auto w-full">
            <div className="text-center mb-6">
              <h1 className="text-4xl md:text-5xl font-90 tracking-tight text-foreground mb-4">
                Your brokerage shows what happened.<br />Vestry keeps why.
              </h1>
            </div>

            <LandingChart onBuyClick={() => scrollTo('reflect')} />
          </div>
        </section>

        {/* Reflect */}
        <section
          data-landing-stop
          id="reflect"
          ref={(el) => { sectionRefs.current[1] = el }}
          className="min-h-[calc(100svh-3.5rem)] flex flex-col justify-center px-6 py-8"
        >
          <RevealSection className="max-w-4xl mx-auto w-full">
            <div className="text-center mb-8">
              <h2 className="text-3xl md:text-4xl font-90 tracking-tight text-foreground mb-4">Reflect on every trade</h2>
              <p className="text-base text-secondary max-w-xl mx-auto leading-relaxed">
                Keep your thoughts in one place. Come back to what you actually thought and recall the context and emotions behind your trades.
              </p>
            </div>

            <LandingJournal onSpyClick={() => scrollTo('analyze')} />
          </RevealSection>
        </section>

        {/* Analyze */}
        <section
          data-landing-stop
          id="analyze"
          ref={(el) => { sectionRefs.current[2] = el }}
          className="min-h-[calc(100svh-3.5rem)] flex flex-col justify-center px-6 py-8"
        >
          <RevealSection className="max-w-3xl mx-auto w-full">
            <div className="text-center mb-6">
              <h2 className="text-3xl md:text-4xl font-90 tracking-tight text-foreground mb-4">Analyze what happened</h2>
              <p className="text-base text-secondary max-w-lg mx-auto leading-relaxed">
                See the entry against customizable metrics. <br /> Understand trends and outcomes without
                noise.
              </p>
            </div>

            <LandingDetailCard />
          </RevealSection>
        </section>

        {/* Improve */}
        <section
          data-landing-stop
          id="improve"
          ref={(el) => { sectionRefs.current[3] = el }}
          className="min-h-[calc(100svh-3.5rem)] flex flex-col"
        >
          <div className="flex flex-1 items-center px-6 py-16">
            <RevealSection className="max-w-3xl mx-auto w-full">
              <LandingCTA onDemoClick={() => openDemo('cta')} loading={loading} error={demoLocation === 'cta' ? error : null} />
            </RevealSection>
          </div>

          <footer className="py-8 px-6 text-center text-sm text-muted">
            <p className="font-90 mb-3">
              Vestry is open-source. If you would like to self-host please follow the instructions on the GitHub repository.
            </p>
            <div className="flex items-center justify-center gap-4">
              <a
                href="https://github.com/fabianjim/vestry"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
                aria-label="GitHub"
              >
                <GithubIcon className="w-4 h-4" />
              </a>
              <a
                href="mailto:fabian.jim26@gmail.com"
                className="hover:text-foreground transition-colors"
                aria-label="Email"
              >
                <EnvelopeIcon className="w-4 h-4" />
              </a>
            </div>
          </footer>
        </section>
      </main>
    </div>
  )
}
