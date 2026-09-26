import { createContext, createElement, useContext, useState, type ReactNode } from 'react'

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

function initialChartDate() {
  const date = new Date()
  const day = date.getDay()
  if (day === 6) date.setDate(date.getDate() - 1)
  if (day === 0) date.setDate(date.getDate() - 2)
  return date
}

function useViewStateValues() {
  return {
    chartMode: useState<'hourly' | 'daily'>('hourly'),
    chartDate: useState(initialChartDate),
    pendingSettings: useState(DEFAULT_SETTINGS),
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
