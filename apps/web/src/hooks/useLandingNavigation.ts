import { useEffect } from 'react'

/** Native scroll snapping handles wheel/touch; keys move between the same sections. */
export function useLandingNavigation(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    const root = document.documentElement
    root.classList.add('landing-scroll')

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.target instanceof Element && event.target.closest(
        'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="application"], [role="slider"], [role="tab"], [role="listbox"]',
      )) return

      const direction = event.key === 'ArrowDown' || (event.key === ' ' && !event.shiftKey)
        ? 1
        : event.key === 'ArrowUp' || (event.key === ' ' && event.shiftKey) ? -1 : 0
      if (!direction) return
      event.preventDefault()
      if (event.repeat) return

      const inset = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0
      const viewport = window.innerHeight - inset
      const maxScroll = root.scrollHeight - window.innerHeight
      const stops: number[] = []
      document.querySelectorAll<HTMLElement>('[data-landing-stop]').forEach((section) => {
        const start = section.getBoundingClientRect().top + window.scrollY - inset
        stops.push(Math.max(0, Math.min(start, maxScroll)))
        // At small heights or high zoom, let readers traverse all of a tall section.
        const overflow = section.offsetHeight - viewport
        for (let offset = viewport; offset < overflow; offset += viewport) {
          stops.push(Math.min(start + offset, maxScroll))
        }
        if (overflow > 1) stops.push(Math.min(start + overflow, maxScroll))
      })
      stops.sort((a, b) => a - b)
      const destination = direction > 0
        ? stops.find((stop) => stop > window.scrollY + 2)
        : [...stops].reverse().find((stop) => stop < window.scrollY - 2)
      if (destination != null) window.scrollTo({
        top: destination,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      root.classList.remove('landing-scroll')
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [enabled])
}
