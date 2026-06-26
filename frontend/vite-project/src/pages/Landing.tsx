import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../services/api'
import { useScrollReveal } from '../hooks/useScrollReveal'
import LandingNav from '../components/landing/LandingNav'
import LandingChart from '../components/landing/LandingChart'
import LandingJournalCard from '../components/landing/LandingJournalCard'
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
                Watch your portfolio unfold hour by hour. Record your thoughts and actions on 4,000+ stocks and ETFs so you can revisit them later.
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

            <LandingJournalCard onSpxClick={() => scrollTo('analyze')} />
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
                See the entry against customizable metrics. <br></br> Understand outcomes without
                noise.
              </p>
            </div>

            <LandingDetailCard onChartClick={() => scrollTo('improve')} />
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
    </div>
  )
}
