import { ViewStateProvider } from '../contexts/ViewState'
import { useState, useEffect, useCallback } from 'react'
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { authApi, demoApi, type SessionUser } from '../services/api'
import { insightsQueries } from '../services/queries'
import { visibleNavItems } from './navItems'
import {
  LogoutIcon,
  GithubIcon,
  ExclamationCircleIcon,
  EnvelopeIcon,
  Bars3Icon,
  ChevronDoubleLeftIcon,
} from './icons'

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
  const items = visibleNavItems(useQuery(insightsQueries.availability()).data?.available === true)

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
    // Phones scroll the document so Safari's toolbar collapse and tap-to-top work;
    // wider screens keep docked sidebars beside an inner scroll area.
    <div className="flex min-h-dvh flex-col bg-background text-foreground md:h-dvh md:flex-row md:overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`hidden shrink-0 overflow-y-auto md:flex flex-col border-r border-border-subtle bg-background-sidebar transition-all duration-300 ${
          isOpen ? 'w-44' : 'w-16'
        }`}
      >
        {/* Toggle Button */}
        <div className={`flex items-center justify-between py-4 pr-4 border-b border-border ${isOpen ? '' : 'pl-4'}`}>
          {isOpen && (
            <span className="flex flex-1 items-center justify-center">
              <img src="/logo.svg" alt="" width={44} height={44} className="shrink-0" />
            </span>
          )}
          <button
            onClick={() => {
              const next = !isOpen
              setIsOpen(next)
              setUserManuallyClosed(!next)
            }}
            className="ml-auto p-2 rounded-md hover:bg-surface-hover active:bg-surface-active transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
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
          {items.map((item) => {
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

      {/* Phone header */}
      <header data-topbar className="sticky top-0 z-40 flex h-12 shrink-0 items-center justify-between border-b border-border-subtle bg-background-sidebar px-3 md:hidden">
        <img src="/logo.svg" alt="Vestry" width={32} height={32} />
        <button
          onClick={handleLogout}
          className="flex h-10 items-center gap-2 rounded-md px-3 text-sm font-130 text-secondary hover:bg-surface-hover active:bg-surface-active hover:text-foreground transition-colors"
        >
          <LogoutIcon className="w-5 h-5" />
          Logout
        </button>
      </header>

      {/* Main Content */}
      <main className="min-w-0 flex-1 flex flex-col pb-14 md:pb-0">
        {isDemo && (
          <div className={`shrink-0 z-30 px-4 md:px-6 py-2 text-sm font-130 ${
            remainingTrades === 0
              ? 'bg-error-soft text-error border-b border-error-border'
              : 'bg-primary-soft text-primary border-b border-primary/20'
          }`}>
            Demo Mode — {remainingTrades} of 3 trades remaining. Changes are not saved.
          </div>
        )}
        {/* data-workspace: the area right of the sidebar and below the banner, which full-area views fill */}
        <div data-workspace className="md:min-h-0 flex-1 flex">
          <div className="min-w-0 flex-1 px-1 md:overflow-auto md:px-0 md:pl-6 flex flex-col">
            <div className="flex-1">
              <ViewStateProvider>
                <Outlet context={{ isDemo, remainingTrades, refreshDemoStatus, priceRevision } as LayoutContext} />
              </ViewStateProvider>
            </div>
            <footer className="py-3 px-6 text-center border-t border-border flex flex-col items-center gap-3 text-sm text-muted">
              <p className="font-90 text-secondary">
                Contributions are welcomed and encouraged. For informational purposes only, not financial advice.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
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

      {/* Phone tab bar */}
      <nav data-tabbar aria-label="Primary" className={`fixed inset-x-0 bottom-0 z-40 grid h-14 ${items.length === 5 ? 'grid-cols-5' : 'grid-cols-4'} border-t border-border-subtle bg-background-sidebar md:hidden`}>
        {items.map((item) => {
          const isActive = location.pathname === item.path
          const Icon = item.icon
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 text-xs font-130 transition-colors ${
                isActive ? 'text-foreground' : 'text-muted active:text-foreground'
              }`}
            >
              <span className={`rounded-full px-4 py-0.5 transition-colors ${isActive ? 'bg-surface-active' : ''}`}>
                <Icon className="w-5 h-5" />
              </span>
              {items.length === 5 ? item.phoneLabel ?? item.label : item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
