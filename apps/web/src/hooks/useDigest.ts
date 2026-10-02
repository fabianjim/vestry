import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../services/api'
import { portfolioQueries } from '../services/queries'

export function useDigest(visible: boolean) {
  const client = useQueryClient()
  const availability = useQuery(portfolioQueries.digestAvailability())
  const enabled = visible && availability.data?.available === true
  const query = useQuery({
    ...portfolioQueries.digest(),
    enabled,
    refetchInterval: query => enabled && !query.state.error && query.state.data?.status === 'GENERATING' ? 2000 : false,
  })
  const generate = useMutation({
    mutationFn: async () => {
      await client.cancelQueries({ queryKey: portfolioQueries.digest().queryKey })
      return portfolioApi.generateDigest()
    },
    retry: false,
    onSuccess: state => client.setQueryData(portfolioQueries.digest().queryKey, state),
  })
  return { available: availability.data?.available === true, query, generate }
}
