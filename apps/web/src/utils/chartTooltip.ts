import type { PointerEvent } from 'react'

/*
 * Recharts' default tooltip slides 400ms after every pointer move, so axis tooltips lag and jitter
 * as they chase the cursor, and flip sides with a jump near the chart's edge. These presets pin the
 * tooltip on the axis that follows the cursor, then let it drift at most MAX_DRIFT_PX with the
 * cursor through a CSS `translate`, which composes with Recharts' own `transform`.
 * Pair them with `trackTooltipDrift` on the element wrapping the chart.
 */
const MAX_DRIFT_PX = 32
const GLIDE = '150ms ease-out'
// `trackTooltipDrift` turns the glide on (`--tooltip-glide`) only once the tooltip has been placed.
const transition = `transform var(--tooltip-glide, 0s), translate ${GLIDE}`

/** For charts that snap to points along the x-axis: pinned near the top, gliding between points. */
export const GLIDING_TOOLTIP = {
  position: { y: 0 },
  wrapperStyle: { translate: '0 var(--tooltip-drift-y, 0px)', transition },
} as const

/** For horizontal bar charts that snap to rows: pinned at `left` (the plot's left edge), gliding between rows. */
export function glidingRowTooltip(left: number) {
  return {
    position: { x: left },
    wrapperStyle: { translate: 'var(--tooltip-drift-x, 0px) 0', transition },
  } as const
}

/** The glass styling of `GlassSelect`, for custom tooltip content. */
export const GLASS_TOOLTIP_CLASS = 'rounded-xl border border-foreground/5 bg-background/35 backdrop-blur-xl shadow-sm shadow-background/20'

const settling = new WeakSet<HTMLElement>()
const watched = new WeakSet<HTMLElement>()

function tooltipPlaced(chart: HTMLElement) {
  const wrapper = chart.querySelector<HTMLElement>('.recharts-tooltip-wrapper')
  return Boolean(wrapper?.style.transform) && wrapper?.style.visibility === 'visible'
}

/**
 * Recharts places a tooltip that has just appeared only after measuring it, from the chart's
 * corner. Gliding that placement would sweep the tooltip in from the corner, so the glide stays
 * off until a placed tooltip has been drawn, and goes off again whenever it loses its place.
 */
function settleGlide(chart: HTMLElement) {
  if (!watched.has(chart)) {
    watched.add(chart)
    chart.addEventListener('pointerleave', () => chart.style.setProperty('--tooltip-glide', '0s'))
  }
  const placed = tooltipPlaced(chart)
  if (!placed) chart.style.setProperty('--tooltip-glide', '0s')
  if (!placed || chart.style.getPropertyValue('--tooltip-glide') === GLIDE || settling.has(chart)) return
  settling.add(chart)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    settling.delete(chart)
    if (tooltipPlaced(chart)) chart.style.setProperty('--tooltip-glide', GLIDE)
  }))
}

/** Sets the drift as CSS variables rather than state, so the chart doesn't re-render on every move. */
export function trackTooltipDrift(event: PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect()
  const drift = (offset: number, size: number) =>
    `${Math.round((size > 0 ? Math.min(Math.max(offset / size, 0), 1) : 0) * MAX_DRIFT_PX)}px`
  event.currentTarget.style.setProperty('--tooltip-drift-x', drift(event.clientX - rect.left, rect.width))
  event.currentTarget.style.setProperty('--tooltip-drift-y', drift(event.clientY - rect.top, rect.height))
  settleGlide(event.currentTarget)
}
