import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../services/api'
import { preloadApplication } from '../utils/loadApplication'
import { redirectAfterLogin } from '../utils/redirectAfterLogin'

/** Mount once on the landing page so every demo button shares the pending login. */
export function useDemoLogin() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    if (loading) return
    preloadApplication()
    setLoading(true)
    setError(null)
    try {
      await authApi.login('demo', 'demo')
      await redirectAfterLogin(navigate)
    } catch {
      setError('The demo is waiting on the server. Try again in a moment.')
    } finally {
      setLoading(false)
    }
  }

  return { start, loading, error }
}
