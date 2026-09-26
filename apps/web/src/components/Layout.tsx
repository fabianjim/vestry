import { ViewStateProvider } from '../contexts/ViewState'
import { useState, useEffect, useCallback } from 'react'
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { authApi, demoApi, type SessionUser } from '../services/api'
import {
  HomeIcon,
  ChartPieIcon,
  DocumentCurrencyDollarIcon,
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
  priceRevision: number
}

export default function Layout({ user, priceRevision }: { user: SessionUser; priceRevision: number }) {
  const [isOpen, setIsOpen] = useState(() => window.innerWidth >= 1280)
  const [userManuallyClosed, setUserManuallyClosed] = useState(false)
  const isDemo = user.isDemo
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
    refreshDemoStatus()
  }, [refreshDemoStatus])

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch (error) {
      console.error('Logout error:', error)
    }
    navigate('/')
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={`shrink-0 overflow-y-auto flex flex-col border-r border-border-subtle bg-background-sidebar transition-all duration-300 ${
          isOpen ? 'w-54' : 'w-16'
        }`}
      >
        {/* Toggle Button */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          {isOpen && <span className="text-lg font-130">Vestry</span>}
          <button
            onClick={() => {
              const next = !isOpen
              setIsOpen(next)
              setUserManuallyClosed(!next)
            }}
            className="p-2 rounded-md hover:bg-surface-hover active:bg-surface-active transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
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
                    ? 'bg-surface-active text-foreground'
                    : 'text-secondary hover:bg-surface-hover active:bg-surface-active hover:text-foreground'
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
            className={`flex items-center rounded-md text-secondary hover:bg-surface-hover active:bg-surface-active hover:text-foreground transition-colors ${
              isOpen ? 'gap-3 w-full px-4 py-3' : 'justify-center w-full p-2'
            }`}
          >
            <LogoutIcon className="w-5 h-5 flex-shrink-0" />
            {isOpen && <span className="text-sm font-130">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="min-w-0 flex-1 flex flex-col">
        {isDemo && (
          <div className={`shrink-0 z-30 px-6 py-2 text-sm font-130 ${
            remainingTrades === 0
              ? 'bg-error-soft text-error border-b border-error-border'
              : 'bg-primary-soft text-primary border-b border-primary/20'
          }`}>
            Demo Mode — {remainingTrades} of 3 trades remaining. Changes are not saved.
          </div>
        )}
        <div className="min-h-0 flex-1 flex">
          <div className="min-w-0 flex-1 overflow-auto pl-6 flex flex-col">
            <div className="flex-1">
              <ViewStateProvider>
                <Outlet context={{ isDemo, remainingTrades, refreshDemoStatus, priceRevision } as LayoutContext} />
              </ViewStateProvider>
            </div>
            <footer className="py-3 px-6 border-t border-border flex flex-col items-center gap-3 text-sm text-muted">
              <p className="font-90 text-secondary">
                Contributions are welcomed and encouraged. For informational purposes only, not financial advice.
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
          </div>
        </div>
      </main>
    </div>
  )
}
