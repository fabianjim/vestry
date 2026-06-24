function ClosedEntry({
  type,
  typeColor,
  ticker,
  date,
}: {
  type: string
  typeColor: string
  ticker: string
  date: string
}) {
  return (
    <div className="flex justify-between items-center py-3 px-5 bg-surface border-t border-border">
      <div className="flex items-center gap-3">
        <span className={`px-2 py-1 text-xs font-130 uppercase rounded ${typeColor}`}>{type}</span>
        <span className="text-sm font-150 text-foreground opacity-70">{ticker}</span>
      </div>
      <span className="text-xs text-muted">{date}</span>
    </div>
  )
}

interface LandingJournalCardProps {
  onSpxClick?: () => void
}

export default function LandingJournalCard({ onSpxClick }: LandingJournalCardProps) {
  return (
    <div className="w-full max-w-lg mx-auto rounded-lg border border-border overflow-hidden hover:border-primary/30 transition-colors">
      <div
        role="button"
        tabIndex={0}
        onClick={onSpxClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSpxClick?.()
          }
        }}
        className="bg-surface p-5 cursor-pointer transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-3">
            <span className="px-2 py-1 text-xs font-130 uppercase bg-gain/10 text-gain rounded">BUY</span>
            <span className="text-sm font-150 text-foreground">SPX</span>
          </div>
          <span className="text-xs text-muted">Jun 18 3:50PM</span>
        </div>

        <div className="text-xs text-muted mb-3">Snapshot: $750.00</div>

        <p className="text-sm text-foreground leading-relaxed">
          Bought SPX near the close. Want to remember why I entered and how the
          thesis plays out over the next few sessions.
        </p>
      </div>
      
      <ClosedEntry type="INSIGHT" typeColor="bg-primary/10 text-primary" ticker="NVDA" date="1:45 PM" />
      <ClosedEntry type="SELL" typeColor="bg-loss/10 text-loss" ticker="AAPL" date="11:35 AM" />
    </div>
  )
}
