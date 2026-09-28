import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, matchPath, useLocation } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import './App.css'
import ApplicationBoundary from './components/ApplicationBoundary'
import LoadingScreen from './components/LoadingScreen'
import { loadApplication } from './utils/loadApplication'
import Portfolio from './pages/Portfolio'
import Login from './pages/Login'
import Landing from './pages/Landing'
import NotFound from './pages/NotFound'

const ApplicationRoutes = lazy(loadApplication)

function ApplicationEntry() {
  const { pathname } = useLocation()
  const isWorkspacePage = ['/dashboard', '/transactions', '/analysis', '/journal']
    .some(path => matchPath(path, pathname))

  if (!isWorkspacePage) return <NotFound />

  return (
    <ApplicationBoundary>
      <Suspense fallback={<LoadingScreen message="Opening your workspace…" />}>
        <ApplicationRoutes />
      </Suspense>
    </ApplicationBoundary>
  )
}

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background text-foreground">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/" element={<Landing />} />
          <Route path="/*" element={<ApplicationEntry />} />
        </Routes>
      </div>
      <Analytics />
    </Router>
  )
}
