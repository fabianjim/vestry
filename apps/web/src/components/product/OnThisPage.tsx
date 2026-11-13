import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ChevronRightIcon } from '../icons'

export interface PageSection {
  id: string
  label: string
}

interface OnThisPageProps {
  sections: PageSection[]
  active: string | null
  onSelect: (id: string) => void
}

/**
 * Desktop list (no visible title; the nav's label names it): the current section at full opacity, the rest faded, with a marker that slides along a thin
 * vertical line to the current item.
 */
export function OnThisPageList({ sections, active, onSelect }: OnThisPageProps) {
  const itemRefs = useRef(new Map<string, HTMLLIElement>())
  const [marker, setMarker] = useState<{ top: number; height: number } | null>(null)

  useLayoutEffect(() => {
    const item = active ? itemRefs.current.get(active) : undefined
    if (item) setMarker({ top: item.offsetTop, height: item.offsetHeight })
  }, [active])

  return (
    <nav aria-label="On this page">
      <div className="relative pl-4">
        <span aria-hidden className="absolute inset-y-0 left-0 w-px bg-border-subtle" />
        {marker && (
          <span
            aria-hidden
            className="absolute left-0 top-0 w-px bg-primary transition-[transform,height] duration-300 ease-out motion-reduce:transition-none"
            style={{ transform: `translateY(${marker.top}px)`, height: marker.height }}
          />
        )}
        <ul>
          {sections.map(({ id, label }) => (
            <li key={id} ref={(el) => { if (el) itemRefs.current.set(id, el); else itemRefs.current.delete(id) }}>
              <a
                href={`#${id}`}
                onClick={(event) => { event.preventDefault(); onSelect(id) }}
                aria-current={active === id ? 'location' : undefined}
                className={`block py-1.5 text-sm transition-colors duration-200 ${
                  active === id ? 'text-foreground' : 'text-foreground/40 hover:text-foreground/75 focus-visible:text-foreground/75'
                }`}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}

/** Phone and tablet: a sticky bar naming the current section that opens the same list. */
export function OnThisPageMenu({ sections, active, onSelect }: OnThisPageProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const current = sections.find((section) => section.id === active) ?? sections[0]

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      menuRef.current?.querySelector('button')?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={menuRef} className="relative mx-auto max-w-6xl px-6">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={listId}
        className="flex h-11 w-full items-center justify-between gap-4 text-sm cursor-pointer"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 text-muted">On this page</span>
          <span className="truncate text-foreground">{current?.label}</span>
        </span>
        <ChevronRightIcon
          className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 motion-reduce:transition-none ${open ? '-rotate-90' : 'rotate-90'}`}
        />
      </button>
      {/* Solid: backdrop-blur does nothing inside an ancestor that already has a backdrop filter. */}
      {open && (
        <nav
          id={listId}
          aria-label="On this page"
          className="absolute inset-x-6 top-full z-50 py-1 bg-background border border-foreground/5 rounded-xl shadow-floating"
        >
          <ul>
            {sections.map(({ id, label }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  onClick={(event) => { event.preventDefault(); setOpen(false); onSelect(id) }}
                  aria-current={active === id ? 'location' : undefined}
                  className={`block px-4 py-2.5 text-sm transition-colors ${
                    active === id ? 'text-foreground' : 'text-foreground/50 hover:text-foreground'
                  }`}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}
