import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ApplicationSession from './components/ApplicationSession'
import Dashboard from './pages/Dashboard'
import Analysis from './pages/Analysis'
import Transactions from './pages/Transactions'
import Journal from './pages/Journal'

export default function ApplicationRoutes() {
  return (
    <ApplicationSession>{(user, priceRevision) => <Routes>
      <Route element={<Layout user={user} priceRevision={priceRevision} />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/analysis" element={<Analysis />} />
        <Route path="/journal" element={<Journal />} />
      </Route>
    </Routes>}</ApplicationSession>
  )
}
