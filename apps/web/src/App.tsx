import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import './App.css'
import ApplicationBoundary from './components/ApplicationBoundary'
import { loadApplication } from './utils/loadApplication'
import Portfolio from './pages/Portfolio'
import Login from './pages/Login'
import Landing from './pages/Landing'

const ApplicationRoutes = lazy(loadApplication)

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background text-foreground">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/" element={<Landing />} />
          <Route path="/*" element={
            <ApplicationBoundary>
              <Suspense fallback={<div role="status" className="p-6 text-muted">Opening your workspace…</div>}>
                <ApplicationRoutes />
              </Suspense>
            </ApplicationBoundary>
          } />
        </Routes>
      </div>
      <Analytics />
    </Router>
  )
}
