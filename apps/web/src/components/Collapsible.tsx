import { useState, type ReactNode } from 'react'

const REGION = 'grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none'

/** Slides its content open and shut, matching the briefing bar. Closed content can't be focused. */
export function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div inert={!open} aria-hidden={!open} className={`${REGION} ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

/**
 * Text that collapses to its first line instead of to nothing. The ellipsis
 * appears once the collapse has finished, since line-clamp can't animate.
 */
export function CollapsibleText({ open, className = '', children }: { open: boolean; className?: string; children: ReactNode }) {
  const [settledClosed, setSettledClosed] = useState(!open)
  const clamped = !open && settledClosed
  return (
    <div
      onTransitionEnd={(e) => { if (e.target === e.currentTarget) setSettledClosed(!open) }}
      className={`${REGION} ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
    >
      <div className={`min-h-[1lh] overflow-hidden ${className} ${clamped ? 'line-clamp-1' : ''}`}>{children}</div>
    </div>
  )
}
