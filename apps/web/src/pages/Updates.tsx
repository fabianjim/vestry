import { useEffect, useId, useState } from 'react'
import LandingNav from '../components/landing/LandingNav'
import LandingFooter from '../components/landing/LandingFooter'
import { useDemoLogin } from '../hooks/useDemoLogin'
import { ChevronRightIcon } from '../components/icons'
import { PLANNED, SHIPPED } from '../components/updates/updates'
import { formatUpdateDate, sortShipped } from '../utils/updates'

/** A title that opens its body. Collapsed by default; the height animates unless reduced motion is on. */
function UpdateItem({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="group flex w-full items-start justify-between gap-6 text-left cursor-pointer"
      >
        <span className="text-base font-130 text-foreground transition-colors group-hover:text-primary group-focus-visible:text-primary">
          {title}
        </span>
        <ChevronRightIcon
          className={`mt-1 h-4 w-4 shrink-0 text-muted transition-transform duration-300 ease-out motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        />
      </button>
      <div
        id={panelId}
        aria-hidden={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <p className="pt-3 text-base leading-relaxed text-secondary">{children}</p>
        </div>
      </div>
    </>
  )
}

export default function Updates() {
  const { start, loading, error } = useDemoLogin()

  useEffect(() => {
    document.title = 'Updates | Vestry'
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <LandingNav onDemoClick={() => void start()} loading={loading} error={error} />

      <main className="mx-auto max-w-3xl px-6 pt-24 pb-24">
        <h1 className="text-3xl font-90 tracking-tight mb-16">Updates</h1>

        <section aria-labelledby="changelog" className="mb-24">
          <h2 id="changelog" className="text-2xl font-90 tracking-tight mb-10 xl:-ml-56">Changelog</h2>
          <ol className="space-y-10">
            {sortShipped(SHIPPED).map((entry) => (
              // From xl the date hangs in the left margin (a 9rem column, 3rem gap), so the text column keeps its full width.
              // The section headings start (xl:-ml-56 = 14rem), a little left of the dates.
              <li key={entry.date + entry.title} className="relative">
                <time
                  dateTime={entry.date}
                  className="block mb-1.5 text-sm text-muted xl:absolute xl:right-full xl:top-0.5 xl:mb-0 xl:mr-12 xl:w-36"
                >
                  {formatUpdateDate(entry.date)}
                </time>
                <UpdateItem title={entry.title}>{entry.body}</UpdateItem>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="roadmap">
          <h2 id="roadmap" className="text-2xl font-90 tracking-tight mb-10 xl:-ml-56">Roadmap</h2>
          <ul className="space-y-10">
            {PLANNED.map((item) => (
              <li key={item.title}>
                <UpdateItem title={item.title}>{item.summary}</UpdateItem>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <LandingFooter />
    </div>
  )
}
