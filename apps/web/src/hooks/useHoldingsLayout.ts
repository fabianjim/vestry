import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../services/api'
import { portfolioQueries } from '../services/queries'
import { DEFAULT_HOLDINGS_LAYOUT, type HoldingsLayout } from '../utils/holdingsLayout'

export function useHoldingsLayout() {
  const client = useQueryClient()
  const query = useQuery(portfolioQueries.layout())
  const [draft, setDraft] = useState<HoldingsLayout | null>(null)
  const save = useMutation({
    mutationFn: async (layout: HoldingsLayout) => {
      await client.cancelQueries({ queryKey: portfolioQueries.layout().queryKey })
      return portfolioApi.saveHoldingsLayout(layout)
    },
    onSuccess: layout => {
      client.setQueryData(portfolioQueries.layout().queryKey, layout)
      setDraft(null)
    },
  })
  // Keep an unsaved selection visible on failure so it can be retried.
  const layout = draft ?? ((save.isPending || save.isError) ? save.variables : undefined)
    ?? query.data ?? DEFAULT_HOLDINGS_LAYOUT

  return {
    layout,
    editing: draft !== null,
    setDraft,
    query,
    save,
    start: () => { save.reset(); setDraft(layout) },
    cancel: () => { save.reset(); setDraft(null) },
    setTopN: (topN: number) => {
      const next = { ...layout, topN }
      if (draft) setDraft(next)
      else save.mutate(next)
    },
  }
}
