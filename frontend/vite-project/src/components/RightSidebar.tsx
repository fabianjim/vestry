import { useState, useEffect } from 'react'
import { roundToMinute } from '../utils/dateUtils'
import WatchlistPanel from './WatchlistPanel'
import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon } from './icons'
import { formatCurrency, formatSignedCurrencyWithPercent } from '../utils/formatUtils'

// Get the abbreviated day name in EST (e.g., "Mon", "Tue", "Fri", "Sat", "Sun")
const getEstDayName = (timestamp: string): string => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'America/New_York',
  })
}

// Check whether the timestamp falls on today's date in EST
const isTodayInEst = (timestamp: string): boolean => {
  if (!timestamp) return false
  const date = new Date(timestamp)
  const now = new Date()
  const dateString = (d: Date) =>
    d.toLocaleDateString('en-US', { timeZone: 'America/New_York' })
  return dateString(date) === dateString(now)
}

type StockData = {
  stock: Stock | null
  stale: boolean
  staleWarning: string | null
  lastSuccessfulFetch: string | null
  eod?: boolean
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

interface RightSidebarProps {
  holdings: Holding[]
  loading: boolean
  onBuyClick: (ticker?: string) => void
  onSellClick: () => void
  onHoldingClick?: (ticker: string) => void
}

export default function RightSidebar({ holdings, loading, onBuyClick, onSellClick, onHoldingClick }: RightSidebarProps) {
  const [isOpen, setIsOpen] = useState(() => window.innerWidth >= 768)
  const [userManuallyClosed, setUserManuallyClosed] = useState(false)
  const [watchlistCount, setWatchlistCount] = useState(0)

  useEffect(() => {
    const handleResize = () => {
      if (!userManuallyClosed) {
        setIsOpen(window.innerWidth >= 1168)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [userManuallyClosed])

  return (
    <aside
      className={`sticky top-0 self-start flex flex-col border-l border-border bg-surface rounded-b-lg transition-all duration-300 ${
          isOpen ? 'w-80' : 'w-36'
        }`}
    >
      {/* Toggle */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        {isOpen && <span className="text-md font-130">Portfolio</span>}
        <button
          onClick={() => {
            const next = !isOpen
            setIsOpen(next)
            setUserManuallyClosed(!next)
          }}
          className="p-1.5 rounded-md hover:bg-surface-hover transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isOpen ? (
            <ChevronDoubleRightIcon className="w-4 h-4" />
          ) : (
            <ChevronDoubleLeftIcon className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Buy/Sell */}
      <div className={`border-b border-border ${isOpen ? 'p-4' : 'p-2'}`}>
        <div className={`flex gap-2 ${!isOpen ? 'flex-col' : ''}`}>
          <button
            onClick={() => onBuyClick()}
            disabled={loading}
            className="flex-1 px-3 py-2 bg-gain text-white rounded-md hover:bg-gain/80 transition-colors disabled:opacity-50 text-sm"
          >
            Buy
          </button>
          <button
            onClick={onSellClick}
            disabled={loading || holdings.length === 0}
            className="flex-1 px-3 py-2 bg-error text-white rounded-md hover:bg-error/80 transition-colors disabled:opacity-50 text-sm"
          >
            Sell
          </button>
        </div>
      </div>

      {/* Holdings */}
      <div>
        <div className={`border-b border-border flex items-center justify-between ${isOpen ? 'px-4 py-3' : 'px-2 py-2'}`}>
          <h3 className={`font-130 ${isOpen ? 'text-sm' : 'text-xs'}`}>Holdings</h3>
          <span className={`text-muted font-130 ${isOpen ? 'text-sm' : 'text-xs'}`}>{holdings.length}</span>
        </div>
        
        {holdings.length === 0 ? (
          <div className={`text-muted ${isOpen ? 'p-4 text-sm' : 'p-2 text-xs'}`}>No holdings yet</div>
        ) : (
          <div className={isOpen ? 'p-2' : 'p-1'}>
            {holdings.map(holding => {
              const currentPrice = holding.stockData?.stock?.currentPrice ?? 0
              const prevClose = holding.stockData?.stock?.prevClose ?? currentPrice
              const dayChange = currentPrice - prevClose
              const dayChangePercent = prevClose > 0 ? (dayChange / prevClose) * 100 : 0
              const marketValue = holding.shares * currentPrice
              const isStale = holding.stockData?.stale ?? false
              const isEod = holding.stockData?.eod ?? false
              
              if (!isOpen) {
                return (
                  <div
                    key={holding.ticker}
                    onClick={() => onHoldingClick?.(holding.ticker)}
                    className="flex justify-between items-center py-1 px-2 text-sm hover:bg-surface-hover rounded transition-colors cursor-pointer"
                  >
                    <span className="font-130 text-foreground hover:text-primary transition-colors">
                      {holding.ticker}
                    </span>
                    <span className="text-muted">{holding.shares}</span>
                  </div>
                )
              }
              
              return (
                <div
                  key={holding.ticker}
                  onClick={() => onHoldingClick?.(holding.ticker)}
                  className={`p-2 mb-1 rounded text-sm cursor-pointer hover:bg-surface-hover transition-colors ${isStale ? 'bg-surface-hover' : 'bg-background/50'}`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-130 text-foreground hover:text-primary transition-colors">
                      {holding.ticker}
                    </span>
                    <span className="text-muted text-xs">{holding.shares} shares</span>
                  </div>
                  <div className="flex justify-between mt-1 text-xs">
                    <span className="text-secondary">{formatCurrency(currentPrice)}</span>
                    <span className={dayChange >= 0 ? 'text-gain' : 'text-loss'}>
                      {formatSignedCurrencyWithPercent(dayChange, dayChangePercent)}
                    </span>
                  </div>
                  <div className="flex justify-between mt-1 text-xs">
                    <span className="text-muted">{formatCurrency(marketValue)}</span>
                    <span className={`${isStale ? 'text-error' : isEod ? 'text-primary' : 'text-muted'}`}>
                      {(() => {
                        if (isStale) return 'Stale'
                        if (isEod) {
                          const eodTimestamp = holding.stockData?.stock?.timestamp ?? ''
                          const eodDay = getEstDayName(eodTimestamp)
                          // Today just shows "EOD"; previous trading days show e.g. "Wed EOD"
                          return isTodayInEst(eodTimestamp) ? 'EOD' : `${eodDay} EOD`
                        }
                        // Not EOD - show last successful fetch time (when we actually fetched/verified the data)
                        const timestamp = holding.stockData?.lastSuccessfulFetch
                        if (!timestamp) return 'Live'
                        const day = getEstDayName(timestamp)
                        const time = roundToMinute(timestamp)
                        // Weekend buys show day + time
                        if (day === 'Sat' || day === 'Sun') {
                          return `${day} ${time}`
                        }
                        // Weekday buys show just time
                        return time
                      })()}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Watchlist */}
      <div className="border-t border-border">
        <div className={`border-b border-border flex items-center justify-between ${isOpen ? 'px-4 py-3' : 'px-2 py-2'}`}>
          <h3 className={`font-130 ${isOpen ? 'text-sm' : 'text-xs'}`}>Watchlist</h3>
          <span className={`text-muted font-130 ${isOpen ? 'text-sm' : 'text-xs'}`}>{watchlistCount}</span>
        </div>
        <div className={isOpen ? 'p-4' : ''}>
          <WatchlistPanel isOpen={isOpen} onCountChange={setWatchlistCount} onBuyClick={onBuyClick} />
        </div>
      </div>
    </aside>
  )
}
