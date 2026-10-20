const SCRIPT_URL = 'https://accounts.google.com/gsi/client'

let script: Promise<GoogleIdentityServices> | undefined

/** Loads Google's sign-in script once, only on pages that show the button. */
export function loadGoogleIdentity() {
  return script ??= new Promise<GoogleIdentityServices>((resolve, reject) => {
    const element = document.createElement('script')
    element.src = SCRIPT_URL
    element.async = true
    element.onload = () => (window.google ? resolve(window.google) : reject(new Error('Google sign-in unavailable')))
    element.onerror = () => {
      script = undefined
      element.remove()
      reject(new Error('Google sign-in unavailable'))
    }
    document.head.appendChild(element)
  })
}
