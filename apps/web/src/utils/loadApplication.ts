let application: Promise<typeof import('../ApplicationRoutes')> | undefined

export function loadApplication() {
  return application ??= import('../ApplicationRoutes').catch(error => {
    application = undefined
    throw error
  })
}

export function preloadApplication() {
  // A failed speculative download must not interrupt the public page.
  void loadApplication().catch(() => {})
}
