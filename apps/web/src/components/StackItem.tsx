import type { ReactNode } from 'react'

/**
 * Grows in or collapses out so neighbouring cards slide instead of jumping.
 * Shared by the landing stacks and the Journal page's filtered list.
 */
export default function StackItem({ show, children, gap = 'pb-2' }: {
  show: boolean
  children: ReactNode
  gap?: string
}) {
  return (
    <div
      aria-hidden={!show}
      inert={!show}
      className={`grid transition-[grid-template-rows,opacity] duration-[450ms] ease-out motion-reduce:transition-none ${
        show ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="min-h-0 overflow-hidden">
        <div className={gap}>{children}</div>
      </div>
    </div>
  )
}
