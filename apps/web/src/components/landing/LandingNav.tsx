import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../../services/api'
import { redirectAfterLogin } from '../../utils/redirectAfterLogin'
import { GithubIcon } from '../icons'
import { preloadApplication } from '../../utils/loadApplication'

export default function LandingNav() {
  const navigate = useNavigate()
  const [demoLoading, setDemoLoading] = useState(false)

  const handleDemo = async () => {
    preloadApplication()
    setDemoLoading(true)
    try {
      await authApi.login('demo', 'demo')
      await redirectAfterLogin(navigate)
    } catch {
      navigate('/login')
    } finally {
      setDemoLoading(false)
    }
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <span className="flex items-center gap-2 text-lg font-130 text-foreground">
          <img src="/logo.svg" alt="" width={42} height={42} className="shrink-0" />
          Vestry
        </span>

        <nav className="flex items-center gap-1 sm:gap-3">
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
            data-demo-button
            onMouseEnter={preloadApplication}
            onFocus={preloadApplication}
            onClick={handleDemo}
            disabled={demoLoading}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary-hover active:bg-primary-active transition-colors disabled:bg-disabled-background disabled:text-disabled-foreground disabled:cursor-not-allowed cursor-pointer"
          >
            Try Demo Now
          </button>
        </nav>
      </div>
    </header>
  )
}
