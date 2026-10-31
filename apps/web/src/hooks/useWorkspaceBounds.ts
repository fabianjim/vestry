import { useLayoutEffect, useState } from 'react'

export type Bounds = { top: number; left: number; width: number; height: number }

/**
 * While active, the visible part of the workspace (right of the sidebar, below the banner, between the phone's
 * top and tab bars) for a fixed view to fill, with the page under it unable to scroll.
 */
export function useWorkspaceBounds(active: boolean): Bounds | null {
  const [bounds, setBounds] = useState<Bounds | null>(null)

  useLayoutEffect(() => {
    if (!active) return
    const workspace = document.querySelector<HTMLElement>('[data-workspace]')
    if (!workspace) return
    // from md up the workspace's first child is the scrolling pane; below md the document scrolls
    const pane = workspace.firstElementChild instanceof HTMLElement ? workspace.firstElementChild : null
    const root = document.documentElement
    const saved = { root: root.style.overflow, pane: pane?.style.overflow ?? '' }
    root.style.overflow = 'hidden'
    if (pane) pane.style.overflow = 'hidden'

    const measure = () => {
      const area = workspace.getBoundingClientRect()
      // hidden bars measure zero, so they don't move the edges on wider screens
      const topbar = document.querySelector('[data-topbar]')?.getBoundingClientRect()
      const tabbar = document.querySelector('[data-tabbar]')?.getBoundingClientRect()
      const top = Math.max(area.top, topbar?.height ? topbar.bottom : 0, 0)
      const bottom = Math.min(area.bottom, tabbar?.height ? tabbar.top : window.innerHeight, window.innerHeight)
      setBounds({ top, left: area.left, width: area.width, height: Math.max(bottom - top, 0) })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(workspace)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      root.style.overflow = saved.root
      if (pane) pane.style.overflow = saved.pane
    }
  }, [active])

  return active ? bounds : null
}
