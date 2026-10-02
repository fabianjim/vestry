import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../services/api'
import { portfolioQueries } from '../services/queries'

export function useDigest(isDemo: boolean, visible: boolean) {
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
  const attempted = useRef<string | null>(null)
  const day = query.data?.day
  const shouldGenerate = enabled && isDemo && !query.isError && query.data?.status === 'IDLE'
  const { mutate } = generate
  useEffect(() => {
    if (!shouldGenerate || !day || attempted.current === day) return
    attempted.current = day
    mutate()
  }, [shouldGenerate, day, mutate])
  return { available: availability.data?.available === true, query, generate }
}
