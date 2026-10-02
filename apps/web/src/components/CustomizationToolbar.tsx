import type { ReactNode } from 'react'

export default function CustomizationToolbar({ title, editing, children }: {
  title: string; editing: boolean; children: ReactNode
}) {
  return <div className={`flex items-center justify-between flex-wrap gap-3 mb-4 ${editing ? 'sticky top-4 z-40 -mx-3' : ''} ${editing
    ? 'rounded-2xl border border-foreground/5 bg-background/35 backdrop-blur-xl shadow-sm shadow-background/20 px-3 py-2' : ''}`}>
    <h1 className={editing ? 'text-sm font-90 text-secondary' : 'text-xl font-130'}>{title}</h1>
    <div className="flex flex-wrap items-center gap-1 text-secondary [&_button]:rounded-lg [&_button]:transition-colors">
      {children}
    </div>
  </div>
}
