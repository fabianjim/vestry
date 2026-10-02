import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../services/api'
import { portfolioQueries } from '../services/queries'
import { DEFAULT_DASHBOARD_LAYOUT, type DashboardLayout } from '../utils/dashboardLayout'

const DEMO_BRIEFING_KEY = 'vestry.demo.briefing-hidden'

export function useDashboardLayout(isDemo: boolean) {
  const client = useQueryClient()
  const query = useQuery(portfolioQueries.dashboardLayout())
  const [draft, setDraft] = useState<DashboardLayout | null>(null)
  const [demoHidden, setDemoHidden] = useState(() => {
    try { return isDemo && localStorage.getItem(DEMO_BRIEFING_KEY) === 'true' } catch { return false }
  })
  const save = useMutation({
    mutationFn: async (layout: DashboardLayout) => {
      await client.cancelQueries({ queryKey: portfolioQueries.dashboardLayout().queryKey })
      return portfolioApi.saveDashboardLayout(layout)
    },
    onSuccess: layout => {
      client.setQueryData(portfolioQueries.dashboardLayout().queryKey, layout)
      if (isDemo) {
        setDemoHidden(!layout.showBriefing)
        try { localStorage.setItem(DEMO_BRIEFING_KEY, String(!layout.showBriefing)) } catch { /* Session preference still applies. */ }
      }
      setDraft(null)
      if (layout.showBriefing) void client.invalidateQueries({ queryKey: portfolioQueries.digest().queryKey })
      else void client.cancelQueries({ queryKey: portfolioQueries.digest().queryKey })
    },
  })
  const stored = query.data ?? DEFAULT_DASHBOARD_LAYOUT
  const layout = draft ?? (isDemo && demoHidden ? { ...stored, showBriefing: false } : stored)
  return {
    layout, editing: draft !== null, setDraft, query, save,
    start: () => { save.reset(); setDraft(layout) },
    cancel: () => { save.reset(); setDraft(null) },
  }
}
