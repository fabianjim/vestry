import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { InformationCircleIcon } from './icons'

type InfoTooltipProps = {
  text: string
}

export default function InfoTooltip({ text }: InfoTooltipProps) {
  const id = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState({ left: 0, top: 0 })

  const position = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect()
    const popup = popupRef.current?.getBoundingClientRect()
    if (!rect || !popup) return
    const left = Math.max(16, Math.min(rect.left + rect.width / 2 - popup.width / 2, window.innerWidth - popup.width - 16))
    const top = rect.bottom + popup.height <= window.innerHeight - 16
      ? rect.bottom : Math.max(16, rect.top - popup.height)
    setPlacement({ left, top })
  }, [])

  const show = () => {
    position()
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node) && !popupRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [open, position])

  return (
    <div
      ref={containerRef}
      className="group relative"
      onPointerEnter={event => { if (event.pointerType === 'mouse') show() }}
      onPointerLeave={event => { if (event.pointerType === 'mouse') setOpen(false) }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}
    >
      <button
        type="button"
        aria-label="More information"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => { position(); setOpen(value => !value) }}
        onFocus={event => { if (event.currentTarget.matches(':focus-visible')) show() }}
        className="flex items-center justify-center pointer-coarse:min-h-[40px] pointer-coarse:min-w-[40px] cursor-help rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <InformationCircleIcon className="w-4 h-4 text-muted group-hover:text-secondary transition-colors" />
      </button>
      {typeof document !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          aria-hidden={!open}
          className={`fixed pt-2 w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto z-[1300] ${open ? 'visible' : 'invisible'}`}
          style={placement}
        >
          <div id={id} role="tooltip" className="p-3 bg-elevated border border-border rounded-md text-sm text-secondary shadow-floating">
            {text}
          </div>
        </div>, document.body,
      )}
    </div>
  )
}
