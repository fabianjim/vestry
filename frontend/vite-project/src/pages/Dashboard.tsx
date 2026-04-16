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
    <div style={{ maxWidth: 1200, margin: '24px auto', padding: '0 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Portfolio Dashboard</h2>
        <button 
          onClick={handleLogout}
          style={{
            padding: '8px 16px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Logout
        </button>
      </div>

      {/* Portfolio Summary */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: 16,
        marginBottom: 24 
      }}>
        <div style={{ 
          padding: 16, 
          backgroundColor: '#f8f9fa', 
          borderRadius: 8,
          border: '1px solid #dee2e6'
        }}>
          <div style={{ fontSize: 14, color: '#6c757d' }}>Total Portfolio Value</div>
          <div style={{ fontSize: 24, color: '#6c757d', fontWeight: 'bold' }}>
            ${calculatePortfolioValue().toFixed(2)}
          </div>
        </div>
        <div style={{ 
          padding: 16, 
          backgroundColor: '#f8f9fa', 
          borderRadius: 8,
          border: '1px solid #dee2e6'
        }}>
          <div style={{ fontSize: 14, color: '#6c757d' }}>Day's Change</div>
          <div style={{ 
            fontSize: 24, 
            fontWeight: 'bold',
            color: calculateDayChange() >= 0 ? '#28a745' : '#dc3545'
          }}>
            {calculateDayChange() >= 0 ? '+' : ''}{calculateDayChange().toFixed(2)}
          </div>
        </div>
        <div style={{ 
          padding: 16, 
          backgroundColor: '#f8f9fa', 
          borderRadius: 8,
          border: '1px solid #dee2e6'
        }}>
          <div style={{ fontSize: 14, color: '#6c757d' }}>Total Holdings</div>
          <div style={{ fontSize: 24, color: '#6c757d', fontWeight: 'bold' }}>
            {results.length}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={fetchPortfolioInfo} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh Portfolio'}
        </button>
        <button 
          type="button" 
          onClick={() => setShowAddModal(true)}
          disabled={loading}
          style={{ backgroundColor: '#28a745', color: 'white' }}
        >
          + Buy Stock
        </button>
      </div>

      {error && <div style={{ color: '#b00020', marginTop: 8, marginBottom: 16 }}>{error}</div>}

      {/* Portfolio History Chart */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ marginBottom: 16 }}>Portfolio Performance</h3>
        <PortfolioChart />
      </div>

      {/* Holdings Table */}
      {results.length > 0 && (
        <div style={{ marginTop: 16, marginBottom: 32 }}>
          <h3>Your Holdings</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Ticker', 'Shares', 'Current Price', 'Day Change', 'Market Value', 'Last Updated', 'Actions'].map(
                    (h) => (
                      <th key={h} style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left', background: '#808080', color: 'white' }}>
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
                    <tr key={i} style={{ backgroundColor: isStale ? '#fff3cd' : 'white', color: '#6c757d' }}>
                      {/* ticker*/}
                      <td style={{ border: '1px solid #ddd', padding: 8, color: '#6c757d' }}>
                        {r.ticker}
                        {isStale && (
                          <span style={{ 
                            fontSize: 10, 
                            color: '#856404',
                            display: 'block',
                            marginTop: 2
                          }}>
                            ⚠ Stale
                          </span>
                        )}
                      </td>
                      {/* shares */}

                      <td style={{ border: '1px solid #ddd', padding: 8, color: '#6c757d' }}>{r.shares}</td>
                      
                      {/* current price */}
                      <td style={{ border: '1px solid #ddd', padding: 8, color: '#6c757d' }}>
                        ${currentPrice.toFixed(2)}
                      </td>
                      
                      {/* day change */}
                      <td style={{ 
                        border: '1px solid #ddd', 
                        padding: 8,
                        color: dayChange >= 0 ? '#28a745' : '#dc3545'
                      }}>
                        {dayChange >= 0 ? '+' : ''}{dayChange.toFixed(2)} ({dayChangePercent.toFixed(2)}%)
                      </td>

                      {/* market value */}
                      <td style={{ border: '1px solid #ddd', padding: 8, color: '#6c757d' }}>
                        ${marketValue.toFixed(2)}
                      </td>

                      {/* last updated */}
                      <td style={{ border: '1px solid #ddd', padding: 8, fontSize: 12, color: '#6c757d' }}>
                        {r.stockData?.stock?.timestamp ? roundToMinute(r.stockData.stock.timestamp) : '-'}
                        {isStale && r.stockData?.staleWarning && (
                          <div style={{ color: '#856404', marginTop: 2 }}>
                            {r.stockData.staleWarning}
                          </div>
                        )}
                      </td>

                      <td style={{ border: '1px solid #ddd', padding: 8 }}>
                        <button
                          onClick={() => removeHolding(r.ticker, r.shares)}
                          disabled={loading}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
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
      <div style={{ marginTop: 32, marginBottom: 32 }}>
        <h3>Transaction History</h3>
        <TransactionHistory />
      </div>

      {/* Watchlist Section */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ marginTop: 16 }}>Watchlist</h3>
        <WatchlistPanel />
      </div>

      {/* Journal Section */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ marginTop: 16 }}>Journal</h3>
        <JournalPanel />
      </div>

      {/* Trending Stocks Section */}
      {trendingStocks.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3>Trending Stocks </h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
            gap: 16 
          }}>
            {trendingStocks.map((stock, i) => (
              <div 
                key={stock.ticker}
                style={{ 
                  padding: 16, 
                  backgroundColor: '#f8f9fa', 
                  borderRadius: 8,
                  border: '1px solid #dee2e6',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontSize: 20, color: '#6c757d', fontWeight: 'bold' }}>#{i + 1} {stock.ticker}</div>
                  <div style={{ fontSize: 12, color: '#6c757d' }}>
                    {stock.holderCount} {stock.holderCount === 1 ? 'investor' : 'investors'} holding
                  </div>
                </div>
                {/* <button
                  onClick={() => {
                    setNewTicker(stock.ticker)
                    setShowAddModal(true)
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
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
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#d3d3d3',
            padding: 24,
            borderRadius: 8,
            width: '90%',
            maxWidth: 400
          }}>
            <h3 style={{ marginTop: 0, color: '#494949' }}>Buy Stock</h3>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, color: 'grey' }}>Ticker Symbol</label>
              <input
                type="text"
                placeholder="e.g., AAPL"
                value={newTicker}
                onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                style={{ 
                  width: '100%', 
                  padding: 8,
                  boxSizing: 'border-box',
                  fontSize: 16
                }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, color: 'grey' }}>Shares</label>
              <input
                type="number"
                placeholder="Number of shares"
                value={newShares}
                onChange={(e) => setNewShares(e.target.value)}
                min="0.01"
                step="0.01"
                style={{ 
                  width: '100%', 
                  padding: 8,
                  boxSizing: 'border-box',
                  fontSize: 16
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => {
                setShowAddModal(false)
                setNewTicker('')
                setNewShares('')
                setError('')
              }}>
                Cancel
              </button>
              <button 
                onClick={addHolding}
                disabled={loading || !newTicker.trim() || !newShares}
                style={{ backgroundColor: '#28a745', color: 'white' }}
              >
                {loading ? 'Buying…' : 'Buy'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Sell Stock Modal */}
      {showSellModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#d3d3d3',
            padding: 24,
            borderRadius: 8,
            width: '90%',
            maxWidth: 400
          }}>
            <h3 style={{ marginTop: 0, color: '#494949' }}>Sell {sellTicker}</h3>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, color: 'grey' }}>
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
                style={{ 
                  width: '100%', 
                  padding: 8,
                  boxSizing: 'border-box',
                  fontSize: 16
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={closeSellModal}>
                Cancel
              </button>
              <button 
                onClick={executeSell}
                disabled={loading || !sellShares || Number(sellShares) <= 0 || Number(sellShares) > maxShares}
                style={{ backgroundColor: '#dc3545', color: 'white' }}
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
