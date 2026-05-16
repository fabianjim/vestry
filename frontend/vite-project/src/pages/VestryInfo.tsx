import { useState, useEffect } from 'react'

type TrendingStock = {
  ticker: string
  holderCount: number
  firstTrackedAt: string
}

export default function VestryInfo() {
  const [trendingStocks, setTrendingStocks] = useState<TrendingStock[]>([])

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

  useEffect(() => {
    fetchTrendingStocks()
  }, [])

  return (
    <div className="max-w-6xl mx-auto mt-6 px-3">
      <h2 className="text-2xl font-150 mb-6">Vestry Info</h2>
      <div className="bg-surface rounded-lg border border-border p-6">
        <p className="text-secondary">
          Vestry is a financial portfolio journaling app for casual traders.
          Track your holdings, analyze your portfolio, and keep a journal of your trading decisions.
        </p>
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
