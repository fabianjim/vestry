import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { roundToMinute } from '../utils/dateUtils'
import PortfolioChart from '../components/PortfolioChart'
import TransactionHistory from '../components/TransactionHistory'
import JournalPrompt from '../components/JournalPrompt'
import JournalPanel from '../components/JournalPanel'
import WatchlistPanel from '../components/WatchlistPanel'
import { journalApi } from '../services/api'

type StockData = {
  stock: Stock | null
  stale: boolean
  staleWarning: string | null
  lastSuccessfulFetch: string | null
}

type Stock = {
  ticker: string
  timestamp: string
  currentPrice: number
  open: number
  prevClose: number
  high: number
  low: number
}

type Holding = {
  ticker: string
  shares: number
  stockData?: StockData | null
}

type TrendingStock = {
  ticker: string
  holderCount: number
  firstTrackedAt: string
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [results, setResults] = useState<Holding[]>([])
  const [trendingStocks, setTrendingStocks] = useState<TrendingStock[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [newTicker, setNewTicker] = useState('')
  const [newShares, setNewShares] = useState('')
  const [showSellModal, setShowSellModal] = useState(false)
  const [sellTicker, setSellTicker] = useState('')
  const [sellShares, setSellShares] = useState('')
  const [maxShares, setMaxShares] = useState(0)
  const [showJournalPrompt, setShowJournalPrompt] = useState(false)
  const [journalPromptTicker, setJournalPromptTicker] = useState('')
  const [journalPromptTradeType, setJournalPromptTradeType] = useState<'BUY' | 'SELL'>('BUY')
  const hasFetched = useRef(false)
  
  useEffect(() => {
    document.title = 'Dashboard'
  }, [])

  const handleLogout = async () => {
    setResults([])
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

  const fetchTrendingStocks = async () => {
    try {
      const res = await fetch('/api/portfolio/trending', {
        method: 'GET',
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setTrendingStocks(data)
      }
    } catch (e) {
      console.error('Failed to fetch trending stocks:', e)
    }
  }

  const fetchPortfolioInfo = async () => {
    setError('')
    setLoading(true)
    try {
      // fetch stock data
      const fetchRes = await fetch('/api/stock/fetch/initial', {
        method: 'GET',
        credentials: 'include',
      })
      if (!fetchRes.ok) throw new Error('Failed to fetch stock data')
      
      // fetch holding data
      const getRes = await fetch('/api/portfolio/holdings', {
        method: 'GET',
        credentials: 'include',
      })
      if (!getRes.ok) throw new Error('Failed to fetch holdings')
      const holdingsData = (await getRes.json()) as Holding[]
      
      // For each holding, fetch detailed stock data with stale info
      const holdingsWithData = await Promise.all(
        holdingsData.map(async (holding) => {
          try {
            const stockRes = await fetch(`/api/stock/data/${holding.ticker}`, {
              method: 'GET',
              credentials: 'include',
            })
            if (stockRes.ok) {
              const stockData: StockData = await stockRes.json()
              return { ...holding, stockData }
            }
            return holding
          } catch {
            return holding
          }
        })
      )
      
      setResults(holdingsWithData)
      await fetchTrendingStocks()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unexpected error'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const addHolding = async () => {
    if (!newTicker.trim() || !newShares || Number(newShares) <= 0) {
      setError('Please enter a valid ticker and shares')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/portfolio/holdings/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: newTicker.trim().toUpperCase(),
          shares: Number(newShares)
        }),
        credentials: 'include',
      })

      if (!response.ok) throw new Error('Failed to add holding')

      const boughtTicker = newTicker.trim().toUpperCase()
      setShowAddModal(false)
      setNewTicker('')
      setNewShares('')
      await fetchPortfolioInfo()
      setJournalPromptTicker(boughtTicker)
      setJournalPromptTradeType('BUY')
      setShowJournalPrompt(true)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unexpected error'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const openSellModal = (ticker: string, shares: number) => {
    setSellTicker(ticker)
    setMaxShares(shares)
    setSellShares('')
    setShowSellModal(true)
  }

  const closeSellModal = () => {
    setShowSellModal(false)
    setSellTicker('')
    setSellShares('')
    setMaxShares(0)
    setError('')
  }

  const executeSell = async () => {
    if (!sellShares || Number(sellShares) <= 0) {
      setError('Please enter a valid number of shares')
      return
    }
    if (Number(sellShares) > maxShares) {
      setError(`Cannot sell more than ${maxShares} shares`)
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/portfolio/holdings/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: sellTicker,
          shares: Number(sellShares)
        }),
        credentials: 'include',
      })

      if (!response.ok) throw new Error('Failed to sell holding')

      const soldTicker = sellTicker
      closeSellModal()
      await fetchPortfolioInfo()
      setJournalPromptTicker(soldTicker)
      setJournalPromptTradeType('SELL')
      setShowJournalPrompt(true)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unexpected error'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const submitJournalPrompt = async (body: string) => {
    if (!body) {
      setShowJournalPrompt(false)
      return
    }
    try {
      await journalApi.createEntry({
        entryType: journalPromptTradeType,
        body,
        ticker: journalPromptTicker,
      })
    } catch (e) {
      console.error('Failed to save journal entry:', e)
    } finally {
      setShowJournalPrompt(false)
      setJournalPromptTicker('')
    }
  }

  const removeHolding = async (ticker: string, shares: number) => {
    openSellModal(ticker, shares)
  }

  const calculatePortfolioValue = () => {
    return results.reduce((total, holding) => {
      const price = holding.stockData?.stock?.currentPrice || 0
      return total + (holding.shares * price)
    }, 0)
  }

  const calculateDayChange = () => {
    let totalChange = 0
    results.forEach(holding => {
      const currentPrice = holding.stockData?.stock?.currentPrice || 0
      const prevClose = holding.stockData?.stock?.prevClose || currentPrice
      const change = (currentPrice - prevClose) * holding.shares
      totalChange += change
    })
    return totalChange
  }

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true
      fetchPortfolioInfo()
    }
  }, [])

  return (
    <div className="max-w-6xl mx-auto mt-6 px-3">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-150 m-0">Vestry Dashboard</h2>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1 px-4 py-2 bg-error text-white border-none rounded cursor-pointer text-sm hover:bg-error/80 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Logout
        </button>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-surface rounded-lg border border-border">
          <div className="text-sm text-muted">Total Portfolio Value</div>
          <div className="text-2xl text-foreground font-130">
            ${calculatePortfolioValue().toFixed(2)}
          </div>
        </div>
        <div className="p-4 bg-surface rounded-lg border border-border">
          <div className="text-sm text-muted">Day's Change</div>
          <div className={`text-2xl font-130 ${calculateDayChange() >= 0 ? 'text-gain' : 'text-loss'}`}>
            {calculateDayChange() >= 0 ? '+' : ''}{calculateDayChange().toFixed(2)}
          </div>
        </div>
        <div className="p-4 bg-surface rounded-lg border border-border">
          <div className="text-sm text-muted">Total Holdings</div>
          <div className="text-2xl text-foreground font-130">
            {results.length}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          disabled={loading}
          className="px-3 py-2 bg-gain text-white rounded-md hover:bg-gain/80 transition-colors disabled:opacity-50"
        >
          + Buy Stock
        </button>
        <button
          type="button"
          onClick={() => navigate('/analysis')}
          className="px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary-hover transition-colors"
        >
          Analysis
        </button>
      </div>

      {error && <div className="text-error mt-2 mb-4">{error}</div>}

      {/* Portfolio History Chart */}
      <div className="mb-8">
        <h3 className="text-xl font-150 mb-4">Portfolio Performance</h3>
        <PortfolioChart />
      </div>

      {/* Holdings Table */}
      {results.length > 0 && (
        <div className="mt-4 mb-8">
          <h3 className="text-xl font-150 mb-4">Your Holdings</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-elevated">
                  {['Ticker', 'Shares', 'Current Price', 'Day Change', 'Market Value', 'Last Updated', 'Actions'].map(
                    (h) => (
                      <th key={h} className="border border-border p-2 text-left text-foreground font-130">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const currentPrice = r.stockData?.stock?.currentPrice ?? 0
                  const prevClose = r.stockData?.stock?.prevClose ?? currentPrice
                  const dayChange = currentPrice - prevClose
                  const dayChangePercent = prevClose > 0 ? (dayChange / prevClose) * 100 : 0
                  const marketValue = r.shares * currentPrice
                  const isStale = r.stockData?.stale ?? false
                  
                  return (
                    <tr key={i} className={`${isStale ? 'bg-surface-hover' : 'bg-surface'} text-secondary hover:bg-surface-hover transition-colors`}>
                      {/* ticker*/}
                      <td className="border border-border p-2">
                        {r.ticker}
                        {isStale && (
                          <span className="text-xs text-error block mt-0.5">
                            ⚠ Stale
                          </span>
                        )}
                      </td>
                      {/* shares */}
                      <td className="border border-border p-2">{r.shares}</td>
                      {/* current price */}
                      <td className="border border-border p-2">
                        ${currentPrice.toFixed(2)}
                      </td>
                      {/* day change */}
                      <td className={`border border-border p-2 ${dayChange >= 0 ? 'text-gain' : 'text-loss'}`}>
                        {dayChange >= 0 ? '+' : ''}{dayChange.toFixed(2)} ({dayChangePercent.toFixed(2)}%)
                      </td>
                      {/* market value */}
                      <td className="border border-border p-2">
                        ${marketValue.toFixed(2)}
                      </td>
                      {/* last updated */}
                      <td className="border border-border p-2 text-xs">
                        {r.stockData?.stock?.timestamp ? roundToMinute(r.stockData.stock.timestamp) : '-'}
                        {isStale && r.stockData?.staleWarning && (
                          <div className="text-error mt-0.5">
                            {r.stockData.staleWarning}
                          </div>
                        )}
                      </td>
                      <td className="border border-border p-2">
                        <button
                          onClick={() => removeHolding(r.ticker, r.shares)}
                          disabled={loading}
                          className="px-2 py-1 bg-error text-white text-xs rounded hover:bg-error/80 transition-colors disabled:opacity-50"
                        >
                          Sell
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transaction History Section */}
      <div className="mt-8 mb-8">
        <h3 className="text-xl font-150 mb-4">Transaction History</h3>
        <TransactionHistory />
      </div>

      {/* Watchlist Section */}
      <div className="mb-8">
        <h3 className="text-xl font-150 mt-4 mb-4">Watchlist</h3>
        <WatchlistPanel />
      </div>

      {/* Journal Section */}
      <div className="mb-8">
        <h3 className="text-xl font-150 mt-4 mb-4">Journal</h3>
        <JournalPanel />
      </div>

      {/* Trending Stocks Section */}
      {trendingStocks.length > 0 && (
        <div className="mt-8">
          <h3 className="text-xl font-150 mb-4">Trending Stocks</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {trendingStocks.map((stock, i) => (
              <div 
                key={stock.ticker}
                className="p-4 bg-surface rounded-lg border border-border flex justify-between items-center"
              >
                <div>
                  <div className="text-xl text-foreground font-130">#{i + 1} {stock.ticker}</div>
                  <div className="text-xs text-muted">
                    {stock.holderCount} {stock.holderCount === 1 ? 'investor' : 'investors'} holding
                  </div>
                </div>
                {/* <button
                  onClick={() => {
                    setNewTicker(stock.ticker)
                    setShowAddModal(true)
                  }}
                  className="px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded hover:bg-primary-hover transition-colors"
                >
                  Buy
                </button> */}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Stock Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-overlay flex justify-center items-center z-50">
          <div className="bg-surface p-6 rounded-lg w-11/12 max-w-md border border-border">
            <h3 className="text-xl font-150 mt-0 mb-4">Buy Stock</h3>
            <div className="mb-4">
              <label className="block mb-1 text-secondary">Ticker Symbol</label>
              <input
                type="text"
                placeholder="e.g., AAPL"
                value={newTicker}
                onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                className="w-full px-2 py-2 bg-surface-hover border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="mb-4">
              <label className="block mb-1 text-secondary">Shares</label>
              <input
                type="number"
                placeholder="Number of shares"
                value={newShares}
                onChange={(e) => setNewShares(e.target.value)}
                min="0.01"
                step="0.01"
                className="w-full px-2 py-2 bg-surface-hover border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => {
                setShowAddModal(false)
                setNewTicker('')
                setNewShares('')
                setError('')
              }} className="px-3 py-2 bg-surface border border-border rounded-md hover:bg-surface-hover transition-colors">
                Cancel
              </button>
              <button 
                onClick={addHolding}
                disabled={loading || !newTicker.trim() || !newShares}
                className="px-3 py-2 bg-gain text-white rounded-md hover:bg-gain/80 transition-colors disabled:opacity-50"
              >
                {loading ? 'Buying…' : 'Buy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sell Stock Modal */}
      {showSellModal && (
        <div className="fixed inset-0 bg-overlay flex justify-center items-center z-50">
          <div className="bg-surface p-6 rounded-lg w-11/12 max-w-md border border-border">
            <h3 className="text-xl font-150 mt-0 mb-4">Sell {sellTicker}</h3>
            <div className="mb-4">
              <label className="block mb-1 text-secondary">
                Shares (max: {maxShares})
              </label>
              <input
                type="number"
                placeholder="Number of shares to sell"
                value={sellShares}
                onChange={(e) => setSellShares(e.target.value)}
                min="0.01"
                max={maxShares}
                step="0.01"
                className="w-full px-2 py-2 bg-surface-hover border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={closeSellModal} className="px-3 py-2 bg-surface border border-border rounded-md hover:bg-surface-hover transition-colors">
                Cancel
              </button>
              <button 
                onClick={executeSell}
                disabled={loading || !sellShares || Number(sellShares) <= 0 || Number(sellShares) > maxShares}
                className="px-3 py-2 bg-error text-white rounded-md hover:bg-error/80 transition-colors disabled:opacity-50"
              >
                {loading ? 'Selling…' : 'Sell'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Journal Prompt Modal */}
      <JournalPrompt
        isOpen={showJournalPrompt}
        onClose={() => setShowJournalPrompt(false)}
        onSubmit={submitJournalPrompt}
        ticker={journalPromptTicker}
        tradeType={journalPromptTradeType}
      />
    </div>
  )
}
