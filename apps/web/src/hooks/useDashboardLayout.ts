import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../services/api'
import { portfolioQueries } from '../services/queries'
import { DEFAULT_DASHBOARD_LAYOUT, type DashboardLayout } from '../utils/dashboardLayout'

export function useDashboardLayout() {
  const client = useQueryClient()
  const query = useQuery(portfolioQueries.dashboardLayout())
  const save = useMutation({
    mutationFn: async (layout: DashboardLayout) => {
      await client.cancelQueries({ queryKey: portfolioQueries.dashboardLayout().queryKey })
      return portfolioApi.saveDashboardLayout(layout)
    },
    onSuccess: layout => {
      client.setQueryData(portfolioQueries.dashboardLayout().queryKey, layout)
      if (layout.showBriefing) void client.invalidateQueries({ queryKey: portfolioQueries.digest().queryKey })
      else void client.cancelQueries({ queryKey: portfolioQueries.digest().queryKey })
    },
  })
  // Retain the v1 API shape; section visibility no longer hides dashboard content.
  const layout = { ...(query.data ?? DEFAULT_DASHBOARD_LAYOUT), showPerformance: true, showJournal: true }
  return { layout, query, save }
}
