import { useState, useEffect } from 'react'
import type { Transaction, PnLSummary } from '../types/transaction'
import { portfolioApi } from '../services/api'
import { formatDateTime } from '../utils/dateUtils'
import { exportToCSV } from '../utils/exportUtils'

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [pnlSummary, setPnlSummary] = useState<PnLSummary | null>(null)

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

  const handleExport = () => {
    const rows = transactions.map((t) => ({
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
          className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-surface-hover border border-border text-muted opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground cursor-pointer"
          aria-label="Export to CSV"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
        <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-elevated">
            {['Date', 'Type', 'Ticker', 'Shares', 'Share Price', 'Total'].map((h) => (
              <th
                key={h}
                className="border border-border p-2 text-left text-foreground font-130"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
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
        </tbody>
      </table>
    </div>
  </div>
  )
}
