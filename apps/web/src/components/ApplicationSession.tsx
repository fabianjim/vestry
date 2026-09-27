import { Fragment, useState, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { createQueryClient } from '../services/queryClient'
import type { SessionUser } from '../services/api'
import { useApplicationSession } from '../hooks/useApplicationSession'
import { usePriceUpdates } from '../hooks/usePriceUpdates'
import LoadingScreen from './LoadingScreen'

export default function ApplicationSession({ children }: {
  children: (user: SessionUser, priceRevision: number) => ReactNode
}) {
  const [client] = useState(createQueryClient)
  const { user, error, expired } = useApplicationSession(client)
  const sessionKey = user ? `${user.userId}:${user.isDemo}` : null
  const revision = usePriceUpdates(client, sessionKey)

  if (expired) return <Navigate to="/login" replace />
  if (!user && !error) return <LoadingScreen message="Checking your session…" />

  if (!user) return (
    <div className="p-6 text-muted" role="alert">
      {error}
      <button className="ml-3 text-primary hover:underline" onClick={() => window.location.reload()}>Retry</button>
    </div>
  )

  return (
    <QueryClientProvider client={client}>
      {error && <p role="status" className="px-6 py-2 text-error">{error}</p>}
      <Fragment key={sessionKey}>{children(user, revision)}</Fragment>
    </QueryClientProvider>
  )
}
