import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { insightsApi } from '../services/api'
import { insightsQueries } from '../services/queries'
import { setInsights } from '../services/queryUpdates'

export function useInsights() {
  const client = useQueryClient()
  const availability = useQuery(insightsQueries.availability())
  const available = availability.data?.available === true
  const query = useQuery({ ...insightsQueries.report(), enabled: available })
  const refresh = useMutation({
    mutationFn: async () => {
      await client.cancelQueries({ queryKey: insightsQueries.report().queryKey })
      return insightsApi.refresh()
    },
    retry: false,
    onSuccess: state => setInsights(client, state),
  })
  return { availability, available, query, refresh }
}
