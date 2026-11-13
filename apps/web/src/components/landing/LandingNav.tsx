import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bars3Icon, GithubIcon, XMarkIcon } from '../icons'
import { preloadApplication } from '../../utils/loadApplication'

interface LandingNavProps {
  onDemoClick: () => void
  loading: boolean
  error: string | null
}

const GITHUB_URL = 'https://github.com/fabianjim/vestry'
const PAGE_LINKS = [
  { to: '/product', label: 'Product' },
  { to: '/updates', label: 'Updates' },
]

export default function LandingNav({ onDemoClick, loading, error }: LandingNavProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const { pathname } = useLocation()

  useEffect(() => setMenuOpen(false), [pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      menuRef.current?.querySelector('button')?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
      <div className="max-w-6xl mx-auto px-3 h-14 flex items-center justify-between">
        {/* -ml offsets the logo SVG's built-in left padding so the mark sits on the container edge. */}
        <Link to="/" className="-ml-[3px] flex items-center gap-1 text-lg leading-none font-130 text-foreground">
          <img src="/logo.svg" alt="" width={28} height={28} className="shrink-0 -translate-y-0.25" />
          Vestry
        </Link>

        <nav className="relative flex items-center gap-1 sm:gap-3">
          {PAGE_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              aria-current={pathname === to ? 'page' : undefined}
              className={`hidden sm:block px-3 py-1.5 rounded-md text-sm transition-colors hover:text-primary hover:bg-background-sidebar focus-visible:bg-background-sidebar ${pathname === to ? 'text-foreground' : 'text-muted'}`}
            >
              {label}
            </Link>
          ))}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:block p-2 text-muted hover:text-foreground transition-colors"
            aria-label="GitHub"
          >
            <GithubIcon className="w-4 h-4" />
          </a>
          {/* ml-1 evens the gaps: GitHub's icon has 8px padding and Sign in's text 12px, so both sides read 24px. */}
          <span aria-hidden className="hidden sm:block ml-1 h-4 w-px bg-border" />

          {/* Below sm there's no room for the page links, so they move into a menu in GitHub's place. */}
          <div ref={menuRef} className="relative sm:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls={menuId}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              className="p-2 text-muted hover:text-foreground transition-colors cursor-pointer"
            >
              {menuOpen ? <XMarkIcon className="w-4 h-4" /> : <Bars3Icon className="w-4 h-4" />}
            </button>
            {/* Solid: backdrop-blur does nothing inside an ancestor that already has a backdrop filter. */}
            {menuOpen && (
              <div
                id={menuId}
                className="absolute left-0 top-full mt-2 min-w-[180px] py-1 bg-background border border-foreground/5 rounded-xl shadow-floating z-50"
              >
                {PAGE_LINKS.map(({ to, label }) => (
                  <Link
                    key={to}
                    to={to}
                    aria-current={pathname === to ? 'page' : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={`block px-4 py-2.5 text-sm transition-colors ${pathname === to ? 'text-foreground' : 'text-secondary hover:text-foreground'}`}
                  >
                    {label}
                  </Link>
                ))}
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-secondary hover:text-foreground transition-colors"
                >
                  <GithubIcon className="w-4 h-4" />
                  GitHub
                </a>
              </div>
            )}
          </div>
          <Link
            to="/login"
            onMouseEnter={preloadApplication}
            onFocus={preloadApplication}
            className="px-3 py-1.5 rounded-md text-sm text-foreground hover:text-primary hover:bg-background-sidebar focus-visible:bg-background-sidebar transition-colors cursor-pointer"
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
