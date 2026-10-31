import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { insightsApi } from '../services/api'
import { insightsQueries } from '../services/queries'
import { refreshInsights } from '../services/queryUpdates'

// how often the overview is read while a report is being built
export const POLL_MS = 3000

export function useInsights() {
  const client = useQueryClient()
  const availability = useQuery(insightsQueries.availability())
  const available = availability.data?.available === true
  const overview = useQuery({
    ...insightsQueries.overview(),
    enabled: available,
    refetchInterval: query => (query.state.data?.status === 'GENERATING' ? POLL_MS : false),
  })
  const generate = useMutation({
    mutationFn: insightsApi.generate,
    retry: false,
    // awaited, so the mutation settles only once the overview says GENERATING, blocked or done
    onSettled: () => refreshInsights(client),
  })
  return { availability, available, overview, generate }
}
