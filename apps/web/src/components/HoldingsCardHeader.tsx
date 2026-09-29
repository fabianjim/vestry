import type { ReactNode } from 'react'

export default function HoldingsCardHeader({ title, controls, children }: {
  title: string; controls?: ReactNode; children?: ReactNode
}) {
  return <div className="flex min-h-9 items-center gap-2 mb-3">
    <h3 className="min-w-0 flex-1 truncate text-lg font-130" title={title}>{title}</h3>
    {children}
    {controls}
  </div>
}
