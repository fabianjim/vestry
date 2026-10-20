import { useEffect, useRef, useState } from 'react'
import { GoogleIcon } from './icons'
import { loadGoogleIdentity } from '../utils/googleIdentity'

/** Opens Google's sign-in popup and hands back an access token for the server to check with Google. */
export default function GoogleSignInButton({ clientId, disabled, onAccessToken }: {
  clientId: string
  disabled?: boolean
  onAccessToken: (accessToken: string) => void
}) {
  const handler = useRef(onAccessToken)
  const [client, setClient] = useState<GoogleTokenClient | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    handler.current = onAccessToken
  }, [onAccessToken])

  useEffect(() => {
    let active = true
    loadGoogleIdentity()
      .then(google => {
        if (!active) return
        setClient(google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'openid email',
          callback: response => { if (response.access_token) handler.current(response.access_token) },
          // Closing the popup or declining is not an error worth showing.
          error_callback: () => {},
        }))
      })
      .catch(() => { if (active) setUnavailable(true) })
    return () => { active = false }
  }, [clientId])

  if (unavailable) return null
  return (
    <button
      type="button"
      // The popup must open directly from the click, so the client is prepared beforehand.
      onClick={() => client?.requestAccessToken()}
      disabled={disabled || !client}
      className="relative w-full px-3 py-2 bg-surface border border-border rounded-md cursor-pointer hover:bg-surface-hover active:bg-surface-active transition-colors disabled:cursor-not-allowed disabled:text-disabled-foreground"
    >
      <GoogleIcon className="absolute left-3 top-1/2 size-[18px] -translate-y-1/2" />
      Continue with Google
    </button>
  )
}
