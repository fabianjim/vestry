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
    return <div style={{ color: '#6c757d' }}>Loading transactions...</div>
  }

  if (error) {
    return <div style={{ color: '#dc3545' }}>Error: {error}</div>
  }

  if (transactions.length === 0) {
    return <div style={{ color: '#6c757d', fontStyle: 'italic' }}>No transactions yet</div>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr>
            {['Date', 'Type', 'Ticker', 'Shares', 'Share Price', 'Total'].map((h) => (
              <th
                key={h}
                style={{
                  border: '1px solid #ddd',
                  padding: '8px',
                  textAlign: 'left',
                  background: '#808080',
                  color: 'white',
                  fontWeight: 'bold',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id} style = {{backgroundColor: 'white'}}>
              <td style={{ border: '1px solid #ddd', padding: '8px', color: '#6c757d' }}>
                {formatDateTime(t.timestamp)}
              </td>
              <td
                style={{
                  border: '1px solid #ddd',
                  padding: '8px',
                  fontWeight: 'bold',
                  color: t.type === 'BUY' ? '#28a745' : '#dc3545',
                }}
              >
                {t.type}
              </td>
              <td style={{ border: '1px solid #ddd', padding: '8px', color: '#6c757d' }}>
                {t.ticker}
              </td>
              <td style={{ border: '1px solid #ddd', padding: '8px', color: '#6c757d' }}>
                {t.shares}
              </td>
              <td style={{ border: '1px solid #ddd', padding: '8px', color: '#6c757d' }}>
                ${t.price.toFixed(2)}
              </td>
              <td style={{ border: '1px solid #ddd', padding: '8px', color: '#6c757d' }}>
                ${t.totalValue.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
