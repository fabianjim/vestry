import { useId, type ReactNode } from 'react'

export default function BriefingBar({ expanded, disabled, onToggle, children }: {
  expanded: boolean; disabled: boolean; onToggle: () => void; children: ReactNode
}) {
  const id = useId()
  return <section className="mb-4 rounded-2xl border border-foreground/5 bg-background/35 backdrop-blur-xl shadow-sm shadow-background/20">
    <h2><button type="button" aria-expanded={expanded} aria-controls={id} disabled={disabled} onClick={onToggle}
      className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-sm text-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary">
      Portfolio Briefing
      <svg aria-hidden="true" className={`size-4 transition-transform duration-300 motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="m4 6 4 4 4-4" />
      </svg>
    </button></h2>
    <div id={id} inert={!expanded} aria-hidden={!expanded}
      className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
      <div className="min-h-0 overflow-hidden">
        <div className="mx-3 border-t border-foreground/5 py-3">{children}</div>
      </div>
    </div>
  </section>
}
