export default function LandingJournalCard() {
  return (
    <div className="w-full max-w-lg mx-auto bg-surface-hover rounded-lg border border-border p-5 hover:border-primary/30 transition-colors">
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

      <div className="mt-4 pt-4 border-t border-border">
        <span className="text-xs text-secondary italic">Reflect on your trades</span>
      </div>
    </div>
  )
}
