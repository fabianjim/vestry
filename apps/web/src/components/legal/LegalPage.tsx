import { useEffect } from 'react'
import LandingNav from '../landing/LandingNav'
import LandingFooter from '../landing/LandingFooter'
import { useDemoLogin } from '../../hooks/useDemoLogin'

export const CONTACT_EMAIL = 'hello@vestry.me'
export const LAST_UPDATED = 'November 12, 2026'

interface LegalPageProps {
  title: string
  children: React.ReactNode
}

export default function LegalPage({ title, children }: LegalPageProps) {
  const { start, loading, error } = useDemoLogin()

  useEffect(() => {
    document.title = `${title} | Vestry`
    window.scrollTo(0, 0)
  }, [title])

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <LandingNav onDemoClick={() => void start()} loading={loading} error={error} />

      <main className="mx-auto max-w-2xl px-6 pt-24 pb-16">
        <h1 className="text-3xl font-90 tracking-tight mb-2">{title}</h1>
        <p className="text-sm text-muted mb-10">Last updated {LAST_UPDATED}</p>
        <div className="space-y-8 text-base leading-relaxed text-secondary [&_h2]:text-lg [&_h2]:font-130 [&_h2]:text-foreground [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:text-primary [&_a:hover]:text-primary-hover">
          {children}
        </div>
      </main>

      <LandingFooter />
    </div>
  )
}
