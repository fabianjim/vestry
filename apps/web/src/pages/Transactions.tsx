import { useEffect } from 'react'
import TransactionHistory from '../components/TransactionHistory'

export default function Transactions() {
  useEffect(() => {
    document.title = 'Transactions'
  }, [])

  return (
    <div className="max-w-6xl mx-auto mt-6 px-3 mb-8">
      <TransactionHistory />
    </div>
  )
}
