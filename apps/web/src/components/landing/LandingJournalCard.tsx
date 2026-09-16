import { JOURNAL_STYLES, journalBadge } from '../../constants/journalStyles'
import type { JournalEntryType } from '../../types/journal'
import { useState } from 'react'

function ClosedEntry({
  type,
  ticker,
  date,
}: {
  type: JournalEntryType
  ticker: string
  date: string
}) {
  return (
    <div className="flex justify-between items-center py-3 px-5 bg-surface border-t border-border">
      <div className="flex items-center gap-3">
        <span className={journalBadge(type)}>{JOURNAL_STYLES[type].label}</span>
        <span className="text-sm font-130 text-foreground opacity-70">{ticker}</span>
      </div>
      <span className="text-xs text-muted">{date}</span>
    </div>
  )
}

interface LandingJournalCardProps {
  onSpxClick?: () => void
}

export default function LandingJournalCard({ onSpxClick }: LandingJournalCardProps) {
  const [clicked, setClicked] = useState(false)

  const handleClick = () => {
    setClicked(true)
    onSpxClick?.()
  }

  return (
    <div className="w-full max-w-lg mx-auto rounded-lg border border-border overflow-hidden hover:border-primary/30 transition-colors">
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleClick()
          }
        }}
        className={`bg-surface p-5 cursor-pointer transition-colors hover:bg-surface-hover active:bg-surface-active focus:outline-none focus:ring-2 focus:ring-primary${clicked ? '' : ' animate-bg-pulse'}`}
      >
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-3">
            <span className={journalBadge('BUY')}>Buy</span>
            <span className="text-sm font-130 text-foreground">SPY</span>
          </div>
          <span className="text-xs text-muted">Jun 18 3:50 PM</span>
        </div>

        <div className="text-xs text-muted mb-3">Snapshot: $750.00</div>

        <p className="text-sm text-foreground leading-relaxed">
          Bought near close as markets begin to rebound after yesterday’s debut from the new Fed chair.
        </p>
      </div>
      
      <ClosedEntry type="INSIGHT" ticker="NVDA" date="1:45 PM" />
      <ClosedEntry type="SELL" ticker="AAPL" date="11:35 AM" />
    </div>
  )
}
