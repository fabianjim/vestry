import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { Transaction, PnLSummary } from '../types/transaction'
import { portfolioApi } from '../services/api'
import { formatDateTime } from '../utils/dateUtils'
import { exportToCSV } from '../utils/exportUtils'
import { FunnelIcon, ArrowDownTrayIcon } from './icons'

interface DropdownPosition {
  top: number
  right: number
}

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [pnlSummary, setPnlSummary] = useState<PnLSummary | null>(null)

  // Filter state
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [selectedTypes, setSelectedTypes] = useState<Set<'BUY' | 'SELL'>>(new Set())
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set())
  const [openFilter, setOpenFilter] = useState<'date' | 'type' | 'ticker' | null>(null)
  const [dropdownPos, setDropdownPos] = useState<DropdownPosition>({ top: 0, right: 0 })

  // Refs for buttons and dropdown containers
  const dateFilterBtnRef = useRef<HTMLButtonElement>(null)
  const typeFilterBtnRef = useRef<HTMLButtonElement>(null)
  const tickerFilterBtnRef = useRef<HTMLButtonElement>(null)
  const dateDropdownRef = useRef<HTMLDivElement>(null)
  const typeDropdownRef = useRef<HTMLDivElement>(null)
  const tickerDropdownRef = useRef<HTMLDivElement>(null)

  const fetchTransactions = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await portfolioApi.getTransactions() as Transaction[]
      setTransactions(data)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unexpected error'
      setError(message)
    } finally {
      setLoading(false)
    }
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
    fetchTransactions()
    fetchPnLSummary()
  }, [])

  // Calculate dropdown position when opening
  const calculatePosition = useCallback((btnRef: React.RefObject<HTMLButtonElement | null>) => {
    if (!btnRef.current) return { top: 0, right: 0 }
    const rect = btnRef.current.getBoundingClientRect()
    return {
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    }
  }, [])

  const handleOpenFilter = (filter: 'date' | 'type' | 'ticker') => {
    if (openFilter === filter) {
      setOpenFilter(null)
      return
    }
    let pos = { top: 0, right: 0 }
    switch (filter) {
      case 'date':
        pos = calculatePosition(dateFilterBtnRef)
        break
      case 'type':
        pos = calculatePosition(typeFilterBtnRef)
        break
      case 'ticker':
        pos = calculatePosition(tickerFilterBtnRef)
        break
    }
    setDropdownPos(pos)
    setOpenFilter(filter)
  }

  // Close dropdowns on click outside (including clicks inside dropdowns)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      const isInDropdown =
        (dateDropdownRef.current && dateDropdownRef.current.contains(target)) ||
        (typeDropdownRef.current && typeDropdownRef.current.contains(target)) ||
        (tickerDropdownRef.current && tickerDropdownRef.current.contains(target))
      const isInButton =
        (dateFilterBtnRef.current && dateFilterBtnRef.current.contains(target)) ||
        (typeFilterBtnRef.current && typeFilterBtnRef.current.contains(target)) ||
        (tickerFilterBtnRef.current && tickerFilterBtnRef.current.contains(target))

      if (!isInDropdown && !isInButton) {
        setOpenFilter(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close dropdowns on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenFilter(null)
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  // Recalculate position on scroll/resize when dropdown is open
  useEffect(() => {
    const handleResize = () => {
      if (!openFilter) return
      let pos = { top: 0, right: 0 }
      switch (openFilter) {
        case 'date':
          pos = calculatePosition(dateFilterBtnRef)
          break
        case 'type':
          pos = calculatePosition(typeFilterBtnRef)
          break
        case 'ticker':
          pos = calculatePosition(tickerFilterBtnRef)
          break
      }
      setDropdownPos(pos)
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleResize, true)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleResize, true)
    }
  }, [openFilter, calculatePosition])

  // Compute unique tickers from loaded transactions
  const uniqueTickers = useMemo(() => {
    return Array.from(new Set(transactions.map(t => t.ticker))).sort()
  }, [transactions])

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Type filter
      if (selectedTypes.size > 0 && !selectedTypes.has(t.type)) return false

      // Ticker filter
      if (selectedTickers.size > 0 && !selectedTickers.has(t.ticker)) return false

      // Date filter
      if (dateFrom) {
        const fromDate = new Date(dateFrom)
        fromDate.setHours(0, 0, 0, 0)
        const txDate = new Date(t.timestamp)
        if (txDate < fromDate) return false
      }

      if (dateTo) {
        const toDate = new Date(dateTo)
        toDate.setHours(23, 59, 59, 999)
        const txDate = new Date(t.timestamp)
        if (txDate > toDate) return false
      }

      return true
    })
  }, [transactions, selectedTypes, selectedTickers, dateFrom, dateTo])

  const handleExport = () => {
    const rows = filteredTransactions.map((t) => ({
      Date: formatDateTime(t.timestamp),
      Type: t.type,
      Ticker: t.ticker,
      Shares: t.shares,
      'Share Price': `$${t.price.toFixed(2)}`,
      'Total Value': `$${t.totalValue.toFixed(2)}`,
    }))
    const today = new Date().toISOString().split('T')[0]
    exportToCSV(rows, `transactions_${today}.csv`)
  }

  const toggleType = (type: 'BUY' | 'SELL') => {
    const newSet = new Set(selectedTypes)
    if (newSet.has(type)) {
      newSet.delete(type)
    } else {
      newSet.add(type)
    }
    setSelectedTypes(newSet)
  }

  const toggleTicker = (ticker: string) => {
    const newSet = new Set(selectedTickers)
    if (newSet.has(ticker)) {
      newSet.delete(ticker)
    } else {
      newSet.add(ticker)
    }
    setSelectedTickers(newSet)
  }

  if (loading) {
    return <div className="text-muted">Loading transactions...</div>
  }

  if (error) {
    return <div className="text-error">Error: {error}</div>
  }

  if (transactions.length === 0) {
    return <div className="text-muted italic">No transactions yet</div>
  }

  return (
    <div>
      {/* P/L Summary */}
      {pnlSummary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-surface rounded-lg border border-border">
            <div className="text-sm text-muted">Total Unrealized P/L</div>
            <div className={`text-2xl font-130 ${pnlSummary.unrealizedPnL >= 0 ? 'text-gain' : 'text-loss'}`}>
              {pnlSummary.unrealizedPnL >= 0 ? '+' : ''}${pnlSummary.unrealizedPnL.toFixed(2)} ({pnlSummary.unrealizedPnLPercent.toFixed(1)}%)
            </div>
          </div>
          <div className="p-4 bg-surface rounded-lg border border-border">
            <div className="text-sm text-muted">Total Realized P/L</div>
            <div className={`text-2xl font-130 ${pnlSummary.realizedPnL >= 0 ? 'text-gain' : 'text-loss'}`}>
              {pnlSummary.realizedPnL >= 0 ? '+' : ''}${pnlSummary.realizedPnL.toFixed(2)} ({pnlSummary.realizedPnLPercent.toFixed(1)}%)
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto relative group">
        <button
          onClick={handleExport}
          title="Export to CSV"
          className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-surface-hover border border-border text-secondary opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground cursor-pointer"
          aria-label="Export filtered selection to CSV"
        >
          <ArrowDownTrayIcon className="w-4 h-4" />
        </button>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-elevated">
              <th className="border border-border p-2 text-left text-foreground font-130 relative group">
                <div className="flex items-center justify-between gap-2">
                  <span>Date</span>
                  <div className="relative inline-block">
                    <button
                      ref={dateFilterBtnRef}
                      onClick={() => handleOpenFilter('date')}
                      className={`p-1 rounded transition-opacity ${
                        openFilter === 'date' || dateFrom || dateTo
                          ? 'opacity-100 text-primary'
                          : 'opacity-0 group-hover:opacity-100 text-muted hover:text-foreground'
                      }`}
                      title="Filter by date"
                    >
                      <FunnelIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </th>
              <th className="border border-border p-2 text-left text-foreground font-130 relative group">
                <div className="flex items-center justify-between gap-2">
                  <span>Type</span>
                  <div className="relative inline-block">
                    <button
                      ref={typeFilterBtnRef}
                      onClick={() => handleOpenFilter('type')}
                      className={`p-1 rounded transition-opacity ${
                        openFilter === 'type' || selectedTypes.size > 0
                          ? 'opacity-100 text-primary'
                          : 'opacity-0 group-hover:opacity-100 text-muted hover:text-foreground'
                      }`}
                      title="Filter by type"
                    >
                      <FunnelIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </th>
              <th className="border border-border p-2 text-left text-foreground font-130 relative group">
                <div className="flex items-center justify-between gap-2">
                  <span>Ticker</span>
                  <div className="relative inline-block">
                    <button
                      ref={tickerFilterBtnRef}
                      onClick={() => handleOpenFilter('ticker')}
                      className={`p-1 rounded transition-opacity ${
                        openFilter === 'ticker' || selectedTickers.size > 0
                          ? 'opacity-100 text-primary'
                          : 'opacity-0 group-hover:opacity-100 text-muted hover:text-foreground'
                      }`}
                      title="Filter by ticker"
                    >
                      <FunnelIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </th>
              <th className="border border-border p-2 text-left text-foreground font-130">
                Shares
              </th>
              <th className="border border-border p-2 text-left text-foreground font-130">
                Share Price
              </th>
              <th className="border border-border p-2 text-left text-foreground font-130">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.map((t) => (
              <tr key={t.id} className="bg-surface hover:bg-surface-hover transition-colors text-secondary">
                <td className="border border-border p-2">
                  {formatDateTime(t.timestamp)}
                </td>
                <td
                  className={`border border-border p-2 font-130 ${t.type === 'BUY' ? 'text-gain' : 'text-loss'}`}
                >
                  {t.type}
                </td>
                <td className="border border-border p-2">{t.ticker}</td>
                <td className="border border-border p-2">{t.shares}</td>
                <td className="border border-border p-2">${t.price.toFixed(2)}</td>
                <td className="border border-border p-2">${t.totalValue.toFixed(2)}</td>
              </tr>
            ))}
            {filteredTransactions.length === 0 && (
              <tr>
                <td colSpan={6} className="border border-border p-4 text-center text-muted italic">
                  No transactions match the selected filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Dropdowns rendered via portal to escape overflow containers */}
      {openFilter === 'date' && createPortal(
        <div
          ref={dateDropdownRef}
          className="bg-surface border border-border rounded-lg shadow-lg p-3 z-50"
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            right: dropdownPos.right,
            width: '16rem',
          }}
        >
          <div className="text-sm font-130 text-foreground mb-2">Filter by Date</div>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-muted block mb-1">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full bg-surface-hover border border-border rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full bg-surface-hover border border-border rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-xs text-primary hover:text-primary-hover"
            >
              Clear
            </button>
          </div>
        </div>,
        document.body
      )}

      {openFilter === 'type' && createPortal(
        <div
          ref={typeDropdownRef}
          className="bg-surface border border-border rounded-lg shadow-lg p-3 z-50"
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            right: dropdownPos.right,
            width: '12rem',
          }}
        >
          <div className="text-sm font-130 text-foreground mb-2">Filter by Type</div>
          <div className="space-y-2">
            {['BUY', 'SELL'].map((type) => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedTypes.has(type as 'BUY' | 'SELL')}
                  onChange={() => toggleType(type as 'BUY' | 'SELL')}
                  className="rounded border-border"
                />
                <span className={type === 'BUY' ? 'text-gain' : 'text-loss'}>{type}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => setSelectedTypes(new Set())}
              className="text-xs text-primary hover:text-primary-hover"
            >
              Clear
            </button>
          </div>
        </div>,
        document.body
      )}

      {openFilter === 'ticker' && createPortal(
        <div
          ref={tickerDropdownRef}
          className="bg-surface border border-border rounded-lg shadow-lg p-3 z-50"
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            right: dropdownPos.right,
            width: '14rem',
          }}
        >
          <div className="text-sm font-130 text-foreground mb-2">Filter by Ticker</div>
          <div className="max-h-48 overflow-y-auto space-y-2">
            {uniqueTickers.map((ticker) => (
              <label key={ticker} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedTickers.has(ticker)}
                  onChange={() => toggleTicker(ticker)}
                  className="rounded border-border"
                />
                <span className="text-secondary">{ticker}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex justify-between">
            <button
              onClick={() => setSelectedTickers(new Set(uniqueTickers))}
              className="text-xs text-primary hover:text-primary-hover"
            >
              Select All
            </button>
            <button
              onClick={() => setSelectedTickers(new Set())}
              className="text-xs text-primary hover:text-primary-hover"
            >
              Clear
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
