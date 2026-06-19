import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../services/api'
import { useScrollReveal } from '../hooks/useScrollReveal'
import LandingNav from '../components/landing/LandingNav'
import LandingChart from '../components/landing/LandingChart'
import LandingJournalCard from '../components/landing/LandingJournalCard'
import LandingDetailCard from '../components/landing/LandingDetailCard'
import LandingCTA from '../components/landing/LandingCTA'

const SECTIONS = ['track', 'reflect', 'analyze', 'improve']

function RevealSection({ children, className }: { children: React.ReactNode; className?: string }) {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>()

  return (
    <div
      ref={ref}
      className={`
        transition-all duration-700 ease-out
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
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [activeSection, setActiveSection] = useState(0)
  const sectionRefs = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    document.title = 'Vestry | Portfolio Journal'

    const checkAuth = async () => {
      try {
        const data = (await authApi.me()) as { username?: string | null } | null
        if (data?.username) {
          navigate('/dashboard', { replace: true })
        }
      } catch {
        // Not authenticated, stay on landing
      } finally {
        setCheckingAuth(false)
      }
    }

    checkAuth()
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
  }, [checkingAuth])

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <span className="text-muted">Loading…</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav />

      <div className="fixed left-6 top-1/2 -translate-y-1/2 z-40 hidden md:flex flex-col gap-4">
        {SECTIONS.map((id, index) => (
          <button
            key={id}
            onClick={() => scrollTo(id)}
            className={`
              h-[2px] rounded-full transition-all duration-300
              ${index === activeSection
                ? 'w-8 bg-primary'
                : 'w-4 bg-foreground/30 hover:bg-foreground/60'
              }
            `}
            aria-label={`Go to ${id} section`}
          />
        ))}
      </div>

      <main className="pt-14">
        {/* Track */}
        <section
          id="track"
          ref={(el) => { sectionRefs.current[0] = el }}
          className="min-h-[calc(100vh-3.5rem)] flex flex-col justify-center px-6 py-16"
        >
          <RevealSection className="max-w-4xl mx-auto w-full">
            <div className="text-center mb-10">
              <h1 className="text-4xl md:text-5xl font-150 text-foreground mb-4">Track your decisions</h1>
              <p className="text-base md:text-lg text-secondary max-w-xl mx-auto leading-relaxed">
                Watch your portfolio unfold hour by hour. The big moments — like a
                buy — stand out so you can revisit them later.
              </p>
            </div>

            <LandingChart onBuyClick={() => scrollTo('reflect')} />
          </RevealSection>
        </section>

        {/* Reflect */}
        <section
          id="reflect"
          ref={(el) => { sectionRefs.current[1] = el }}
          className="min-h-screen flex flex-col justify-center px-6 py-16"
        >
          <RevealSection className="max-w-3xl mx-auto w-full">
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-150 text-foreground mb-4">Reflect on every trade</h2>
              <p className="text-base text-secondary max-w-lg mx-auto leading-relaxed">
                Attach context to each move. A short note today becomes a valuable
                signal tomorrow.
              </p>
            </div>

            <LandingJournalCard />
          </RevealSection>
        </section>

        {/* Analyze */}
        <section
          id="analyze"
          ref={(el) => { sectionRefs.current[2] = el }}
          className="min-h-screen flex flex-col justify-center px-6 py-16"
        >
          <RevealSection className="max-w-3xl mx-auto w-full">
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-150 text-foreground mb-4">Analyze what happened</h2>
              <p className="text-base text-secondary max-w-lg mx-auto leading-relaxed">
                See the entry against price history. Understand outcomes without
                noise.
              </p>
            </div>

            <LandingDetailCard />
          </RevealSection>
        </section>

        {/* Improve */}
        <section
          id="improve"
          ref={(el) => { sectionRefs.current[3] = el }}
          className="min-h-screen flex flex-col justify-center px-6 py-16"
        >
          <RevealSection className="max-w-3xl mx-auto w-full">
            <LandingCTA onDemoClick={() => {
              const demoButton = document.querySelector('[data-demo-button]') as HTMLButtonElement | null
              demoButton?.click()
            }} />
          </RevealSection>
        </section>
      </main>

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
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
          <a
            href="mailto:fabian.jim26@gmail.com"
            className="hover:text-foreground transition-colors"
            aria-label="Email"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </a>
        </div>
      </footer>
    </div>
  )
}
