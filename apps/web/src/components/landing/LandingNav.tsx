import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../../services/api'
import { redirectAfterLogin } from '../../utils/redirectAfterLogin'

export default function LandingNav() {
  const navigate = useNavigate()
  const [demoLoading, setDemoLoading] = useState(false)

  const handleDemo = async () => {
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
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <span className="text-lg font-150 text-foreground">Vestry</span>

        <nav className="flex items-center gap-3">
          <a
            href="/login"
            className="px-3 py-1.5 text-sm text-foreground hover:text-primary transition-colors cursor-pointer"
          >
            Sign in
          </a>
          <button
            type="button"
            data-demo-button
            onClick={handleDemo}
            disabled={demoLoading}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50 cursor-pointer"
          >
            Try Demo Now
          </button>
        </nav>
      </div>
    </header>
  )
}
