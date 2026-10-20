import { useCallback, useSyncExternalStore } from 'react'

/**
 * Tracks a CSS media query. Prefer Tailwind breakpoint classes; use this only when a
 * component must render a different tree. Media queries measure rem at 16px, so
 * '(min-width: 64rem)' matches Tailwind `lg:` even though the root font is 14px.
 */
export function useMediaQuery(query: string) {
  const subscribe = useCallback((onChange: () => void) => {
    const list = window.matchMedia(query)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}
