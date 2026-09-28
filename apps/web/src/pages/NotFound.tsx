import { useEffect } from 'react'
import { Link } from 'react-router-dom'

export default function NotFound() {
  useEffect(() => {
    document.title = 'Page not found · Vestry'
  }, [])

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted">
      <p className="text-5xl font-130 tracking-tight text-primary">404</p>
      <div className="space-y-2">
        <h1 className="text-lg font-130 text-foreground">Page not found</h1>
        <p>This page doesn’t exist or may have moved.</p>
      </div>
      <Link
        to="/"
        className="rounded-md px-3 py-2 text-primary transition-colors hover:bg-primary-soft hover:text-primary-hover"
      >
        Back to home
      </Link>
    </main>
  )
}
