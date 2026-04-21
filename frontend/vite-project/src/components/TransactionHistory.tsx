import { useState, useEffect } from 'react'
import type { Transaction } from '../types/transaction'
import { formatDateTime } from '../utils/dateUtils'

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  const fetchTransactions = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/portfolio/transactions', {
        method: 'GET',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to fetch transactions')
      const data = await response.json()
      setTransactions(data)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unexpected error'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTransactions()
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
    <div className="overflow-x-auto">
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
  )
}
