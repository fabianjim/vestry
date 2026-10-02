import type { ReactNode } from 'react'

export default function CustomizationToolbar({ title, editing, glass = false, children, content }: {
  title: string; editing: boolean; glass?: boolean; children: ReactNode; content?: ReactNode
}) {
  return <div className={`flex items-center justify-between flex-wrap gap-3 mb-4 ${editing ? 'sticky top-4 z-40 -mx-3' : ''} ${editing || glass
    ? 'rounded-2xl border border-foreground/5 bg-background/35 backdrop-blur-xl shadow-sm shadow-background/20 px-3 py-2' : ''}`}>
    <h1 className={editing || glass ? 'text-sm font-90 text-secondary' : 'text-xl font-130'}>{title}</h1>
    <div className="flex flex-wrap items-center gap-1 text-secondary [&_button]:rounded-lg [&_button]:transition-colors">
      {children}
    </div>
    {content && <div className="w-full border-t border-foreground/5 pt-3 pb-1">{content}</div>}
  </div>
}
