import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { Source } from '../types/source'
import { faviconUrl, formatSourceDate, sourceHref, sourceInitial, sourceName } from '../utils/sources'

const CLOSE_DELAY = 120

/** A source's favicon in grayscale, or its initial when there is no URL or the icon fails to load. */
export function SourceIcon({ source, className = 'size-3 rounded-sm object-contain', letterClassName = 'text-[10px]' }: {
  source: Source; className?: string; letterClassName?: string
}) {
  const src = faviconUrl(source)
  const [failed, setFailed] = useState<string | null>(null)
  if (!src || failed === src) {
    return <span aria-hidden="true" className={`${letterClassName} leading-none font-130 text-secondary`}>{sourceInitial(source)}</span>
  }
  return <img src={src} alt="" aria-hidden="true" loading="lazy" referrerPolicy="no-referrer"
    onError={() => setFailed(src)} className={`${className} shrink-0 grayscale`} />
}

function SourceRow({ source }: { source: Source }) {
  const href = sourceHref(source)
  const date = formatSourceDate(source.publishedOn)
  const title = 'line-clamp-2 text-xs text-foreground'
  return <li className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
    <SourceIcon source={source} className="size-7 rounded-full object-cover"
      letterClassName="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs" />
    <span className="min-w-0">
      <span className="block truncate text-xs text-muted">{sourceName(source)}{date && <span className="ml-1.5">{date}</span>}</span>
      {href
        ? <a href={href} target="_blank" rel="noopener noreferrer"
          className={`${title} rounded hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}>{source.title}</a>
        : <span className={title}>{source.title}</span>}
    </span>
  </li>
}

/**
 * A small circle after a sentence. One source shows its icon and links to it; several show "+N".
 * Hovering, focusing or (for several) tapping opens a glass card listing each source.
 */
export default function SourceMarker({ sources, className = '' }: { sources: Source[]; className?: string }) {
  const id = useId()
  const trigger = useRef<HTMLElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const closing = useRef<number | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null)
  const single = sources.length === 1 ? sources[0] : null
  const href = single ? sourceHref(single) : null

  const cancelClose = () => window.clearTimeout(closing.current)
  const show = () => { cancelClose(); setOpen(true) }
  const close = useCallback(() => { window.clearTimeout(closing.current); setOpen(false); setPlacement(null) }, [])
  const closeSoon = () => { cancelClose(); closing.current = window.setTimeout(close, CLOSE_DELAY) }

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect()
      const panel = card.current?.getBoundingClientRect()
      if (!anchor || !panel) return
      const left = Math.max(16, Math.min(anchor.left + anchor.width / 2 - panel.width / 2, window.innerWidth - panel.width - 16))
      const below = anchor.bottom + 6
      const top = below + panel.height <= window.innerHeight - 16 ? below : Math.max(16, anchor.top - panel.height - 6)
      setPlacement({ left, top })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!trigger.current?.contains(target) && !card.current?.contains(target)) close()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const inside = card.current?.contains(document.activeElement)
      close()
      if (inside) trigger.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open, close])

  useEffect(() => () => window.clearTimeout(closing.current), [])

  if (sources.length === 0) return null
  const label = single ? `Source: ${sourceName(single)}, ${single.title}` : `${sources.length} sources`
  const circle = `relative ml-1 inline-flex size-[18px] items-center justify-center rounded-full border border-foreground/10 bg-foreground/5 align-[2px] text-[10px] leading-none font-130 text-secondary transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary before:absolute before:-inset-2 before:content-[''] ${open ? 'bg-foreground/10 text-foreground' : ''} ${className}`
  const hover = {
    onPointerEnter: (event: ReactPointerEvent) => { if (event.pointerType === 'mouse') show() },
    onPointerLeave: (event: ReactPointerEvent) => { if (event.pointerType === 'mouse') closeSoon() },
  }
  const focus = {
    onFocus: (event: ReactFocusEvent<HTMLElement>) => { if (event.currentTarget.matches(':focus-visible')) show() },
    onBlur: (event: ReactFocusEvent) => { if (!card.current?.contains(event.relatedTarget as Node)) closeSoon() },
  }
  const content = single ? <SourceIcon source={single} /> : `+${sources.length}`

  return <>
    {href
      ? <a ref={trigger as RefObject<HTMLAnchorElement>} href={href} target="_blank" rel="noopener noreferrer"
        aria-label={label} aria-describedby={open ? id : undefined} className={circle} {...hover} {...focus}>{content}</a>
      : <button ref={trigger as RefObject<HTMLButtonElement>} type="button" aria-label={label} aria-expanded={open}
        aria-controls={open ? id : undefined} className={circle} {...hover} {...focus}
        onClick={() => {
          if (open) return close()
          show()
          requestAnimationFrame(() => card.current?.querySelector<HTMLElement>('a')?.focus())
        }}>{content}</button>}
    {open && typeof document !== 'undefined' && createPortal(
      <div ref={card} id={id} role={single ? 'tooltip' : 'dialog'} aria-label={single ? undefined : label}
        onPointerEnter={cancelClose} onPointerLeave={event => { if (event.pointerType === 'mouse') closeSoon() }}
        onBlur={event => {
          if (!card.current?.contains(event.relatedTarget as Node) && event.relatedTarget !== trigger.current) closeSoon()
        }}
        onKeyDown={(event: ReactKeyboardEvent) => {
          if (event.key !== 'Tab') return
          const links = card.current?.querySelectorAll<HTMLElement>('a')
          const boundary = event.shiftKey ? links?.[0] : links?.[links.length - 1]
          if (event.target === boundary) { event.preventDefault(); close(); trigger.current?.focus() }
        }}
        style={placement ?? { left: 0, top: 0 }}
        className={`fixed z-[1300] w-72 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto p-1 bg-background/35 backdrop-blur-xl border border-foreground/5 rounded-xl shadow-sm shadow-background/20 ${placement ? 'visible' : 'invisible'}`}>
        <ul className="flex flex-col gap-0.5">
          {sources.map((source, index) => <SourceRow key={`${source.url ?? source.title}-${index}`} source={source} />)}
        </ul>
      </div>, document.body)}
  </>
}
