import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

function positionAt(button: HTMLButtonElement) {
  const bounds = button.getBoundingClientRect()
  return {
    top: Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - 328)),
    right: Math.max(8, window.innerWidth - bounds.right),
  }
}

export default function HoldingsPopover({ label, trigger, disabled, children }: {
  label: string; trigger: ReactNode; disabled?: boolean; children: ReactNode
}) {
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()
  const open = position !== null
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent | FocusEvent) => {
      if (!panel.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setPosition(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setPosition(null); button.current?.focus() }
    }
    const reposition = () => {
      if (button.current) setPosition(positionAt(button.current))
    }
    panel.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)')?.focus()
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    document.addEventListener('keydown', escape)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  return <div className="relative shrink-0">
    <button ref={button} type="button" disabled={disabled} aria-label={label} aria-expanded={open} aria-controls={id}
      className="rounded px-2 py-1.5 text-sm hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
      onClick={() => {
        setPosition(open ? null : positionAt(button.current!))
      }}>{trigger}</button>
    {position && createPortal(<div className="fixed inset-0 z-50 pointer-events-none overflow-hidden contain-paint">
      <div ref={panel} id={id} aria-label={label}
        onClick={event => {
          if ((event.target as Element).closest('button')) { setPosition(null); button.current?.focus() }
        }}
        onKeyDown={event => {
          if (event.key !== 'Tab') return
          const controls = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')
          const boundary = event.shiftKey ? controls?.[0] : controls?.[controls.length - 1]
          if (event.target === boundary) {
            event.preventDefault(); setPosition(null); button.current?.focus()
          }
        }}
        style={{ ...position, maxHeight: `min(20rem, calc(100dvh - ${position.top + 8}px))` }}
        className="fixed pointer-events-auto w-64 max-w-[80vw] overflow-y-auto rounded-lg border border-border bg-elevated p-2 shadow-floating">
        {children}
      </div>
    </div>, document.body)}
  </div>
}
