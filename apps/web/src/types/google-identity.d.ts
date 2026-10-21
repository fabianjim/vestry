// The subset of Google Identity Services used by GoogleSignInButton.
// https://developers.google.com/identity/oauth2/web/reference/js-reference
interface GoogleTokenClient {
  requestAccessToken(): void
}

interface GoogleIdentityServices {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string
        scope: string
        callback: (response: { access_token?: string }) => void
        error_callback?: (error: { type: string }) => void
      }): GoogleTokenClient
    }
  }
}

interface Window {
  google?: GoogleIdentityServices
}
