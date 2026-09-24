import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Analysis from './pages/Analysis'
import Transactions from './pages/Transactions'
import Journal from './pages/Journal'

export default function ApplicationRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/analysis" element={<Analysis />} />
        <Route path="/journal" element={<Journal />} />
      </Route>
    </Routes>
  )
}
