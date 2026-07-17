import { useState, useEffect, useCallback } from 'react'
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { authApi, demoApi } from '../services/api'
import {
  HomeIcon,
  ChartPieIcon,
  DocumentCurrencyDollarIcon,
  QuestionMarkCircleIcon,
  BookOpenIcon,
  LogoutIcon,
  GithubIcon,
  ExclamationCircleIcon,
  EnvelopeIcon,
  Bars3Icon,
  ChevronDoubleLeftIcon,
} from './icons'

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: HomeIcon },
  { path: '/analysis', label: 'Holding Analysis', icon: ChartPieIcon },
  { path: '/transactions', label: 'Transactions', icon: DocumentCurrencyDollarIcon },
  { path: '/journal', label: 'Journal', icon: BookOpenIcon },
  { path: '/vestry-info', label: 'Vestry Info', icon: QuestionMarkCircleIcon },
]

const footerItems = [
  {
    href: 'https://github.com/fabianjim/vestry',
    label: 'GitHub',
    icon: GithubIcon,
    external: true,
  },
  {
    href: 'https://github.com/fabianjim/vestry/issues',
    label: 'Report an Issue',
    icon: ExclamationCircleIcon,
    external: true,
  },
  {
    href: 'mailto:fabian.jim26@gmail.com',
    label: 'Contact',
    icon: EnvelopeIcon,
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
            {isOpen ? (
              <ChevronDoubleLeftIcon className="w-5 h-5" />
            ) : (
              <Bars3Icon className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 py-4">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path
            const Icon = item.icon
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center rounded-md transition-colors ${
                  isOpen ? 'gap-3 px-4 py-3 mx-2' : 'justify-center px-2 py-3 mx-2'
                } ${
                  isActive
                    ? 'bg-primary/20 text-primary'
                    : 'text-secondary hover:bg-surface-hover hover:text-foreground'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
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
            <LogoutIcon className="w-5 h-5 flex-shrink-0" />
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
            {footerItems.map((item) => {
              const Icon = item.icon
              return (
                <a
                  key={item.label}
                  href={item.href}
                  target={item.external ? '_blank' : undefined}
                  rel={item.external ? 'noopener noreferrer' : undefined}
                  className="flex items-center gap-2 hover:text-foreground transition-colors"
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-90">{item.label}</span>
                </a>
              )
            })}
          </div>
        </footer>
      </main>
    </div>
  )
}
