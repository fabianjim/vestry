import { Link } from 'react-router-dom'
import { GithubIcon } from '../icons'
import { preloadApplication } from '../../utils/loadApplication'

interface LandingNavProps {
  onDemoClick: () => void
  loading: boolean
  error: string | null
}

export default function LandingNav({ onDemoClick, loading, error }: LandingNavProps) {

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <span className="flex items-center gap-2 text-lg font-130 text-foreground">
          <img src="/logo.svg" alt="" width={42} height={42} className="shrink-0" />
          Vestry
        </span>

        <nav className="relative flex items-center gap-1 sm:gap-3">
          <a
            href="https://github.com/fabianjim/vestry"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-muted hover:text-foreground transition-colors"
            aria-label="GitHub"
          >
            <GithubIcon className="w-4 h-4" />
          </a>
          <Link
            to="/login"
            onMouseEnter={preloadApplication}
            onFocus={preloadApplication}
            className="px-3 py-1.5 text-sm text-foreground hover:text-primary transition-colors cursor-pointer"
          >
            Sign in
          </Link>
          <button
            type="button"
            onMouseEnter={preloadApplication}
            onFocus={preloadApplication}
            onClick={onDemoClick}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary-hover active:bg-primary-active transition-colors disabled:bg-disabled-background disabled:text-disabled-foreground disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? 'Opening demo…' : 'Try the demo'}
          </button>
          {error && <p role="status" className="absolute right-0 top-full mt-3 w-64 rounded-md border border-border bg-surface p-3 text-sm text-secondary">{error}</p>}
        </nav>
      </div>
    </header>
  )
}
