import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Portfolio() {
  const navigate = useNavigate()
  
  useEffect(() => {
    document.title = 'Create Portfolio'
  }, [])
  
  const [holdings, setHoldings] = useState<Array<{ ticker: string; shares: string }>>([
    { ticker: '', shares: '' },
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  const addHolding = () => setHoldings([...holdings, { ticker: '', shares: '' }])
  const removeHolding = (idx: number) => setHoldings(holdings.filter((_, i) => i !== idx))
  const updateHolding = (idx: number, updated: { ticker: string; shares: string }) =>
    setHoldings(holdings.map((h, i) => (i === idx ? updated : h)))

  const handleLogout = async () => {
    setHoldings([{ ticker: '', shares: '' }])
    setError('')
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      })      
    } catch (error) {
      console.error('Logout error:', error)
    }
    navigate('/login')
  }

  const validate = (): string => {
    if (holdings.length === 0) return 'Add at least one holding'
    for (const h of holdings) {
      if (!h.ticker || h.ticker.trim() === '') return 'Ticker is required for all holdings'
      if (h.shares === '' || isNaN(Number(h.shares))) return 'Shares must be a number for all holdings'
      if (Number(h.shares) < 0) return 'Shares cannot be negative'
    }
    return ''
  }

  const createPortfolio = async () => {
    setError('')
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    
    setLoading(true)
    try {
      const payload = {
        holdings: holdings.map((h) => ({
          ticker: h.ticker.trim().toUpperCase(),
          shares: Number(h.shares),
        })),
      }
      
      const response = await fetch('/api/portfolio/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: "include",
      })
      
      if (!response.ok) throw new Error('Failed to create portfolio, backend must be running')

      navigate('/dashboard')
      
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unexpected error'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto mt-6 px-3">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-150 m-0">Portfolio</h2>
        <button 
          onClick={handleLogout}
          className="px-4 py-2 bg-error text-white border-none rounded cursor-pointer text-sm hover:bg-error/80 transition-colors"
        >
          Logout
        </button>
      </div>
      

      {holdings.map((h, idx) => (
        <div key={idx} className="flex gap-3 items-center mb-2">
          <input
            placeholder="Ticker (e.g., AAPL)"
            value={h.ticker}
            onChange={(e) => updateHolding(idx, { ...h, ticker: e.target.value.toUpperCase() })}
            maxLength={10}
            className="px-2 py-2 bg-surface border border-border rounded-md text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary w-40"
          />
          <input
            placeholder="Shares"
            type="number"
            value={h.shares}
            onChange={(e) => updateHolding(idx, { ...h, shares: e.target.value })}
            className="px-2 py-2 bg-surface border border-border rounded-md text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary w-32"
          />
          <button type="button" onClick={() => removeHolding(idx)} className="px-3 py-2 bg-surface border border-border rounded-md hover:bg-surface-hover transition-colors">Remove</button>
        </div>
      ))}

      <div className="flex gap-2 mt-3">
        <button type="button" onClick={addHolding} className="px-3 py-2 bg-surface border border-border rounded-md hover:bg-surface-hover transition-colors">Add Holding</button>
        <button type="button" onClick={createPortfolio} disabled={loading} className="px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50">
          {loading ? 'Creating…' : 'Create Portfolio'}
        </button>
      </div>

      {error && <div className="text-error mt-2">{error}</div>}
    </div>
  )
}
