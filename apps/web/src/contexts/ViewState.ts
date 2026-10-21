import { createContext, createElement, useContext, useState, type ReactNode } from 'react'
import type { DateWindow, PerformanceLens, PerformanceRange } from '../utils/chartData'

export type GraphSettings = {
  groupBySector: boolean
  displayWatchlist: boolean
  displayETFs: boolean
}

const DEFAULT_SETTINGS: GraphSettings = {
  groupBySector: true,
  displayWatchlist: true,
  displayETFs: true,
}

type PanelTab = 'performance' | 'metadata'
export type PanelScope = 'dashboard' | 'analysis'

function useViewStateValues() {
  return {
    chartRange: useState<PerformanceRange>('ALL'),
    chartLens: useState<PerformanceLens>('value'),
    // Dates picked in place of a range; null follows the range.
    chartDates: useState<DateWindow | null>(null),
    appliedSettings: useState(DEFAULT_SETTINGS),
    panelTabs: useState<Record<PanelScope, PanelTab>>({ dashboard: 'performance', analysis: 'metadata' }),
  }
}

const ViewStateContext = createContext<ReturnType<typeof useViewStateValues> | null>(null)

// Layout survives route changes and is remounted by the authenticated session boundary.
// Keep navigation preferences in memory; never persist drafts or account data here.
export function ViewStateProvider({ children }: { children: ReactNode }) {
  const value = useViewStateValues()
  return createElement(ViewStateContext.Provider, { value }, children)
}

export function useViewState() {
  const value = useContext(ViewStateContext)
  if (!value) throw new Error('View state requires ViewStateProvider')
  return value
}
