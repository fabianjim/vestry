import type { ReactNode, RefObject } from 'react'
import { Bars3Icon, BookOpenIcon, ChartPieIcon, DocumentCurrencyDollarIcon, DocumentMagnifyingGlassIcon, HomeIcon } from '../../icons'
import { H, STORY_EASE, W, useScale } from './storyKit'

/** The Product page stories' shared app chrome: window, sidebar, cursor and detail rows. */

export function Cursor({ x, y, click, visible }: { x: number; y: number; click: boolean; visible: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute left-0 top-0 z-50 transition-[transform,opacity] duration-700 ${STORY_EASE} ${visible ? 'opacity-100' : 'opacity-0'}`}
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      {click && <span key={`${x}${y}`} className="absolute -left-4 -top-4 h-8 w-8 rounded-full border border-primary animate-click" />}
      <svg width="22" height="22" viewBox="0 0 22 22" className="drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]">
        <path d="M3 2.5 18 10l-6.6 1.9L8.6 18.6Z" className="fill-foreground stroke-background" strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    </div>
  )
}

export function Sidebar({ page }: { page: 'dashboard' | 'holdings' | 'journal' }) {
  const items = [
    { id: 'dashboard', icon: HomeIcon },
    { id: 'holdings', icon: ChartPieIcon },
    { id: 'transactions', icon: DocumentCurrencyDollarIcon },
    { id: 'journal', icon: BookOpenIcon },
    { id: 'insights', icon: DocumentMagnifyingGlassIcon },
  ]
  return (
    <aside className="flex w-16 shrink-0 flex-col border-r border-border-subtle bg-background-sidebar">
      <div className="flex items-center justify-center border-b border-border py-4">
        <span className="p-2 text-secondary"><Bars3Icon className="h-5 w-5" /></span>
      </div>
      <nav className="flex-1 py-4">
        {items.map(({ id, icon: Icon }) => (
          <span
            key={id}
            data-cursor={`nav-${id}`}
            className={`mx-2 flex justify-center rounded-md px-2 py-3 transition-colors duration-300 ${page === id ? 'bg-surface-active text-foreground' : 'text-secondary'}`}
          >
            <Icon className="h-5 w-5" />
          </span>
        ))}
      </nav>
    </aside>
  )
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-foreground">{children}</span>
    </div>
  )
}

/** The scaled, inert app window. `rootRef` is what cursor positions are measured against. */
export function StoryWindow({ viewRef, rootRef, fade, children }: {
  viewRef: RefObject<HTMLDivElement | null>
  rootRef: RefObject<HTMLDivElement | null>
  fade: boolean
  children: ReactNode
}) {
  const { ref: sizeRef, scale } = useScale(W)
  return (
    <div ref={viewRef} aria-hidden className="select-none">
      <div ref={sizeRef} className="relative w-full" style={{ height: H * scale }}>
        {scale > 0 && (
          <div
            ref={rootRef}
            inert
            className={`absolute left-0 top-0 flex overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-floating transition-opacity duration-500 ${fade ? 'opacity-0' : 'opacity-100'}`}
            style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  )
}
