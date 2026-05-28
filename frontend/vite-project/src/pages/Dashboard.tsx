import { useState, useEffect, useRef } from 'react'
import PortfolioChart from '../components/PortfolioChart'
import type { PortfolioChartHandle } from '../components/PortfolioChart'
import JournalPrompt from '../components/JournalPrompt'
import JournalPanel from '../components/JournalPanel'
import type { JournalPanelHandle } from '../components/JournalPanel'
import RightSidebar from '../components/RightSidebar'
import type { PnLSummary } from '../types/transaction'
import { journalApi, portfolioApi } from '../services/api'

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

export default function Dashboard() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [results, setResults] = useState<Holding[]>([])
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
  const portfolioChartRef = useRef<PortfolioChartHandle>(null)
  const journalPanelRef = useRef<JournalPanelHandle>(null)
  const [activeJournalId, setActiveJournalId] = useState<number | null>(null)
  const [pnlSummary, setPnlSummary] = useState<PnLSummary | null>(null)

  // Manual trade recording state (shared between buy/sell modals)
  const [manualExpanded, setManualExpanded] = useState(false)
  const [manualHour, setManualHour] = useState(new Date().getHours())
  const [manualMinutes, setManualMinutes] = useState('')
  const [manualPrice, setManualPrice] = useState('')
  const [manualTradeTime, setManualTradeTime] = useState<string | null>(null)
  const [manualTradePrice, setManualTradePrice] = useState<number | null>(null)

  // Update the hour field every minute so it stays current
  useEffect(() => {
    const interval = setInterval(() => {
      setManualHour(new Date().getHours())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  // When the modal opens, reset manual state
  const resetManualState = () => {
    setManualExpanded(false)
    setManualHour(new Date().getHours())
    setManualMinutes('')
    setManualPrice('')
    setManualTradeTime(null)
    setManualTradePrice(null)
  }

  useEffect(() => {
    document.title = 'Dashboard'
  }, [])

  const fetchPortfolioInfo = async () => {
    setError('')
    setLoading(true)
    try {
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
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unexpected error'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  // Validate manual trade inputs. Returns { valid: false, error: string } or { valid: true, isoTime: string, price: number }
  const validateManualInputs = (): { valid: false; error: string } | { valid: true; isoTime: string; price: number } => {
    if (!manualExpanded) {
      return { valid: true, isoTime: '', price: 0 }
    }

    const hasMinutes = manualMinutes.trim() !== ''
    const hasPrice = manualPrice.trim() !== ''

    if ((hasMinutes || hasPrice) && !(hasMinutes && hasPrice)) {
      return { valid: false, error: 'Enter all values, else clear for live info' }
    }

    if (!hasMinutes && !hasPrice) {
      return { valid: true, isoTime: '', price: 0 }
    }

    const minutesNum = Number(manualMinutes)
    if (Number.isNaN(minutesNum) || minutesNum < 0 || minutesNum > 59 || !Number.isInteger(minutesNum)) {
      return { valid: false, error: 'Minutes must be a whole number between 0 and 59' }
    }

    const priceNum = Number(manualPrice)
    if (Number.isNaN(priceNum) || priceNum <= 0) {
      return { valid: false, error: 'Price must be greater than 0' }
    }

    const now = new Date()
    const tradeTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), manualHour, minutesNum, 0, 0)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    if (tradeTime > now) {
      return { valid: false, error: 'Trade time must be within the last hour' }
    }
    if (tradeTime < oneHourAgo) {
      return { valid: false, error: 'Trade time must be within the last hour' }
    }

    return { valid: true, isoTime: tradeTime.toISOString(), price: priceNum }
  }

  const addHolding = async () => {
    if (!newTicker.trim() || !newShares || Number(newShares) <= 0) {
      setError('Please enter a valid ticker and shares')
      return
    }

    const manualValidation = validateManualInputs()
    if (!manualValidation.valid) {
      setError(manualValidation.error)
      return
    }

    setLoading(true)
    try {
      await portfolioApi.addHolding(
        newTicker.trim().toUpperCase(),
        Number(newShares),
        manualValidation.price > 0 ? manualValidation.price : undefined,
        manualValidation.isoTime || undefined
      )

      const boughtTicker = newTicker.trim().toUpperCase()
      setShowAddModal(false)
      setNewTicker('')
      setNewShares('')
      setManualTradeTime(manualValidation.isoTime || null)
      setManualTradePrice(manualValidation.price > 0 ? manualValidation.price : null)
      resetManualState()
      await fetchPortfolioInfo()
      await fetchPnLSummary()
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

  const closeSellModal = () => {
    setShowSellModal(false)
    setSellTicker('')
    setSellShares('')
    setMaxShares(0)
    setError('')
    resetManualState()
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

    const manualValidation = validateManualInputs()
    if (!manualValidation.valid) {
      setError(manualValidation.error)
      return
    }

    setLoading(true)
    try {
      await portfolioApi.sellHolding(
        sellTicker,
        Number(sellShares),
        manualValidation.price > 0 ? manualValidation.price : undefined,
        manualValidation.isoTime || undefined
      )

      const soldTicker = sellTicker
      setManualTradeTime(manualValidation.isoTime || null)
      setManualTradePrice(manualValidation.price > 0 ? manualValidation.price : null)
      closeSellModal()
      await fetchPortfolioInfo()
      await fetchPnLSummary()
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
      setManualTradeTime(null)
      setManualTradePrice(null)
      portfolioChartRef.current?.refresh()
      journalPanelRef.current?.refreshEntries()
      return
    }
    try {
      await journalApi.createEntry({
        entryType: journalPromptTradeType,
        body,
        ticker: journalPromptTicker,
        timestamp: manualTradeTime || undefined,
        priceSnapshot: manualTradePrice || undefined,
      })
    } catch (e) {
      console.error('Failed to save journal entry:', e)
    } finally {
      setShowJournalPrompt(false)
      setJournalPromptTicker('')
      setManualTradeTime(null)
      setManualTradePrice(null)
      portfolioChartRef.current?.refresh()
      journalPanelRef.current?.refreshEntries()
    }
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

  const calculateDayChangePercent = () => {
    let totalChange = 0
    let totalPrevValue = 0
    results.forEach(holding => {
      const currentPrice = holding.stockData?.stock?.currentPrice || 0
      const prevClose = holding.stockData?.stock?.prevClose || currentPrice
      const change = (currentPrice - prevClose) * holding.shares
      totalChange += change
      totalPrevValue += prevClose * holding.shares
    })
    return totalPrevValue > 0 ? (totalChange / totalPrevValue) * 100 : 0
  }

  const fetchPnLSummary = async () => {
    try {
      const data = await portfolioApi.getPnLSummary() as PnLSummary
      setPnlSummary(data)
    } catch (e) {
      console.error('Failed to fetch P/L summary:', e)
    }
  }

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true
      fetchPortfolioInfo()
      fetchPnLSummary()
    }
  }, [])

  return (
    <div className="flex min-h-screen gap-6"> {/* if modifying sidebar gap also update Layout.tsx */}
      {/* Main Content */}
      <div className="flex-1 max-w-6xl mx-auto mt-6 px-3">
        <h2 className="text-2xl font-150 mb-6">Dashboard</h2>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-surface rounded-lg border border-border">
          <div className="text-sm text-muted">Total Portfolio Value</div>
          <div className="text-2xl text-foreground font-130">
            ${calculatePortfolioValue().toFixed(2)}
          </div>
        </div>
        <div className="p-4 bg-surface rounded-lg border border-border">
          <div className="text-sm text-muted">Total Day's Change</div>
          <div className={`text-2xl font-130 ${calculateDayChange() >= 0 ? 'text-gain' : 'text-loss'}`}>
            {`${calculateDayChange() >= 0 ? '+' : ''}$${calculateDayChange().toFixed(2)} (${calculateDayChangePercent().toFixed(1)}%)`}
          </div>
        </div>
        <div className="p-4 bg-surface rounded-lg border border-border">
          <div className="text-sm text-muted">Total P/L</div>
          <div className={`text-2xl font-130 ${(pnlSummary?.totalPnL ?? 0) >= 0 ? 'text-gain' : 'text-loss'}`}>
            {pnlSummary ? `${pnlSummary.totalPnL >= 0 ? '+' : ''}$${pnlSummary.totalPnL.toFixed(2)} (${pnlSummary.totalPnLPercent.toFixed(1)}%)` : '—'}
          </div>
        </div>
      </div>

      {error && <div className="text-error mt-2 mb-4">{error}</div>}

      {/* Portfolio History Chart */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-xl font-150">Portfolio Performance</h3>
          <div className="group relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted group-hover:text-secondary cursor-help transition-colors"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-80 p-3 bg-surface-hover border border-border rounded-md text-sm text-secondary opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 shadow-lg">
              Updated hourly on trading days (10am-4pm)
            </div>
          </div>
        </div>
        <PortfolioChart
          ref={portfolioChartRef}
          onPinClick={(id) => {
            setActiveJournalId(id)
            journalPanelRef.current?.scrollToEntry(id)
          }}
        />
      </div>

      {/* Holdings Table */}
      {/* Journal Section */}
      <div className="mb-8">
        <h3 className="text-xl font-150 mt-4 mb-4">Journal</h3>
        <JournalPanel ref={journalPanelRef} activeJournalId={activeJournalId} onClearActive={() => setActiveJournalId(null)} />
      </div>

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

            {/* Manual Time & Price Toggle */}
            <button
              type="button"
              onClick={() => setManualExpanded(!manualExpanded)}
              className="flex items-center gap-1 text-sm text-secondary hover:text-foreground transition-colors mb-2"
            >
              <span className={`transition-transform ${manualExpanded ? 'rotate-180' : ''}`}>▼</span>
              Manually Record Time & Amount
            </button>

            {manualExpanded && (
              <div className="mb-4 p-3 bg-surface-hover border border-border rounded-md">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-xs text-muted mb-1">Hour</label>
                    <input
                      type="text"
                      value={(manualHour === 0 ? 12 : manualHour > 12 ? manualHour - 12 : manualHour).toString()}
                      readOnly
                      className="w-full px-2 py-1.5 bg-surface border border-border rounded-md text-foreground text-sm opacity-70 cursor-default"
                    />
                  </div>
                  <span className="text-muted pt-5">:</span>
                  <div className="flex-1">
                    <label className="block text-xs text-muted mb-1">Minutes</label>
                    <input
                      type="text"
                      placeholder="00"
                      value={manualMinutes}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 2)
                        setManualMinutes(val)
                      }}
                      className="w-full px-2 py-1.5 bg-surface border border-border rounded-md text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="flex-[2]">
                    <label className="block text-xs text-muted mb-1">Price / Share</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                      min="0.01"
                      step="0.01"
                      className="w-full px-2 py-1.5 bg-surface border border-border rounded-md text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setManualMinutes('')
                      setManualPrice('')
                    }}
                    className="mt-5 px-2 py-1.5 text-sm text-secondary hover:text-foreground bg-surface border border-border rounded-md hover:bg-surface-hover transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              {error && <span className="text-error text-sm mr-auto">{error}</span>}
              <button onClick={() => {
                setShowAddModal(false)
                setNewTicker('')
                setNewShares('')
                setError('')
                resetManualState()
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
            <h3 className="text-xl font-150 mt-0 mb-4">Sell Stock</h3>
            
            {!sellTicker && (
              <div className="mb-4">
                <label className="block mb-1 text-secondary">Select Holding</label>
                <select
                  value={sellTicker}
                  onChange={(e) => {
                    const ticker = e.target.value
                    const holding = results.find(h => h.ticker === ticker)
                    if (holding) {
                      setSellTicker(ticker)
                      setMaxShares(holding.shares)
                    }
                  }}
                  className="w-full px-2 py-2 bg-surface-hover border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Choose a holding...</option>
                  {results.map(h => (
                    <option key={h.ticker} value={h.ticker}>
                      {h.ticker} ({h.shares} shares)
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            {sellTicker && (
              <>
                <div className="mb-2 text-sm text-secondary">
                  Selling: <span className="text-foreground font-130">{sellTicker}</span>
                </div>
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
              </>
            )}

            {/* Manual Time & Price Toggle */}
            <button
              type="button"
              onClick={() => setManualExpanded(!manualExpanded)}
              className="flex items-center gap-1 text-sm text-secondary hover:text-foreground transition-colors mb-2"
            >
              <span className={`transition-transform ${manualExpanded ? 'rotate-180' : ''}`}>▼</span>
              Manually Record Time & Amount
            </button>

            {manualExpanded && (
              <div className="mb-4 p-3 bg-surface-hover border border-border rounded-md">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-xs text-muted mb-1">Hour</label>
                    <input
                      type="text"
                      value={(manualHour === 0 ? 12 : manualHour > 12 ? manualHour - 12 : manualHour).toString()}
                      readOnly
                      className="w-full px-2 py-1.5 bg-surface border border-border rounded-md text-foreground text-sm opacity-70 cursor-default"
                    />
                  </div>
                  <span className="text-muted pt-5">:</span>
                  <div className="flex-1">
                    <label className="block text-xs text-muted mb-1">Minutes</label>
                    <input
                      type="text"
                      placeholder="00"
                      value={manualMinutes}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 2)
                        setManualMinutes(val)
                      }}
                      className="w-full px-2 py-1.5 bg-surface border border-border rounded-md text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="flex-[2]">
                    <label className="block text-xs text-muted mb-1">Price / Share</label>
                    <input
                      type="number"
                      placeholder="150.00"
                      value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                      min="0.01"
                      step="0.01"
                      className="w-full px-2 py-1.5 bg-surface border border-border rounded-md text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setManualMinutes('')
                      setManualPrice('')
                    }}
                    className="mt-5 px-2 py-1.5 text-sm text-secondary hover:text-foreground bg-surface border border-border rounded-md hover:bg-surface-hover transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
            
            <div className="flex items-center justify-end gap-2">
              {error && <span className="text-error text-sm mr-auto">{error}</span>}
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
        onClose={() => {
          setShowJournalPrompt(false)
          portfolioChartRef.current?.refresh()
          journalPanelRef.current?.refreshEntries()
        }}
        onSubmit={submitJournalPrompt}
        ticker={journalPromptTicker}
        tradeType={journalPromptTradeType}
      />
      </div>

      {/* Right Sidebar */}
      <RightSidebar
        holdings={results}
        loading={loading}
        onBuyClick={() => setShowAddModal(true)}
        onSellClick={() => setShowSellModal(true)}
      />
    </div>
  )
}
