import TransactionHistory from '../components/TransactionHistory'

export default function Transactions() {
  return (
    <div className="max-w-6xl mx-auto mt-6 px-3 mb-8">
      <h2 className="text-2xl font-150 mb-6">Transactions</h2>
      <TransactionHistory />
    </div>
  )
}
