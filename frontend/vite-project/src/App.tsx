import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import './App.css'
import Layout from './components/Layout'
import Portfolio from './pages/Portfolio'
import Login from './pages/Login'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Analysis from './pages/Analysis'
import Transactions from './pages/Transactions'
import VestryInfo from './pages/VestryInfo'

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background text-foreground">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/" element={<Landing />} />
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/vestry-info" element={<VestryInfo />} />
          </Route>
        </Routes>
      </div>
    </Router>
  )
}
