import { useState, useEffect, useCallback } from 'react'
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { authApi, demoApi } from '../services/api'

const navItems = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/analysis', label: 'Holding Analysis' },
  { path: '/transactions', label: 'Transactions' },
  { path: '/vestry-info', label: 'Vestry Info' },
]

const footerItems = [
  {
    href: 'https://github.com/fabianjim/vestry',
    label: 'GitHub',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
      </svg>
    ),
    external: true,
  },
  {
    href: 'https://github.com/fabianjim/vestry/issues',
    label: 'Report an Issue',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    external: true,
  },
  {
    href: 'mailto:fabian.jim26@gmail.com',
    label: 'Contact',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    external: false,
  },
]

export interface LayoutContext {
  isDemo: boolean
  remainingTrades: number
  refreshDemoStatus: () => Promise<void>
}

export default function Layout() {
  const [isOpen, setIsOpen] = useState(() => window.innerWidth >= 1280)
  const [userManuallyClosed, setUserManuallyClosed] = useState(false)
  const [isDemo, setIsDemo] = useState(false)
  const [remainingTrades, setRemainingTrades] = useState(3)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const handleResize = () => {
      if (!userManuallyClosed) {
        setIsOpen(window.innerWidth >= 1348)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [userManuallyClosed])

  const refreshDemoStatus = useCallback(async () => {
    if (!isDemo) return
    try {
      const data = await demoApi.status() as { remainingTrades: number }
      setRemainingTrades(data.remainingTrades)
    } catch (e) {
      console.error('Failed to fetch demo status:', e)
    }
  }, [isDemo])

  useEffect(() => {
    const loadAuth = async () => {
      try {
        const data = await authApi.me() as { isDemo?: boolean }
        setIsDemo(data.isDemo ?? false)
      } catch (e) {
        console.error('Failed to fetch auth state:', e)
      }
    }
    loadAuth()
  }, [location.pathname])

  useEffect(() => {
    refreshDemoStatus()
  }, [refreshDemoStatus])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      })
    } catch (error) {
      console.error('Logout error:', error)
    }
    navigate('/')
  }

  return (
    <div className="flex min-h-screen gap-6 bg-background text-foreground"> {/* if modifying sidebar gap also update Dashboard.tsx */}
      {/* Sidebar */}
      <aside
        className={`sticky top-0 h-screen flex flex-col border-r border-border bg-surface transition-all duration-300 ${
          isOpen ? 'w-54' : 'w-16'
        }`}
      >
        {/* Toggle Button */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          {isOpen && <span className="text-lg font-150">Vestry</span>}
          <button
            onClick={() => {
              const next = !isOpen
              setIsOpen(next)
              setUserManuallyClosed(!next)
            }}
            className="p-2 rounded-md hover:bg-surface-hover transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 py-4">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-md transition-colors ${
                  isActive
                    ? 'bg-primary/20 text-primary'
                    : 'text-secondary hover:bg-surface-hover hover:text-foreground'
                }`}
              >
                <span className="text-sm font-130">{item.label.charAt(0)}</span>
                {isOpen && <span className="text-sm font-130">{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Logout Button */}
        <div className={`border-t border-border ${isOpen ? 'p-4' : 'p-2'}`}>
          <button
            onClick={handleLogout}
            className={`flex items-center rounded-md text-secondary hover:bg-surface-hover hover:text-foreground transition-colors ${
              isOpen ? 'gap-3 w-full px-4 py-3' : 'justify-center w-full p-2'
            }`}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {isOpen && <span className="text-sm font-130">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto flex flex-col">
        {isDemo && (
          <div className={`px-6 py-2 text-sm font-130 ${
            remainingTrades === 0
              ? 'bg-error/20 text-error border-b border-error/30'
              : 'bg-primary/10 text-primary border-b border-primary/20'
          }`}>
            Demo Mode — {remainingTrades} of 3 trades remaining. Changes are not saved.
          </div>
        )}
        <div className="flex-1">
          <Outlet context={{ isDemo, remainingTrades, refreshDemoStatus } as LayoutContext} />
        </div>
        <footer className="py-5 px-6 border-t border-border flex flex-col items-center gap-3 text-sm text-muted">
          <p className="font-90 text-secondary">
            Contributions are welcomed and encouraged.
          </p>
          <div className="flex items-center gap-6">
            {footerItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target={item.external ? '_blank' : undefined}
                rel={item.external ? 'noopener noreferrer' : undefined}
                className="flex items-center gap-2 hover:text-foreground transition-colors"
              >
                {item.icon}
                <span className="font-90">{item.label}</span>
              </a>
            ))}
          </div>
        </footer>
      </main>
    </div>
  )
}
