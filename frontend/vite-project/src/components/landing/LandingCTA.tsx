interface LandingCTAProps {
  onDemoClick: () => void
}

export default function LandingCTA({ onDemoClick }: LandingCTAProps) {
  return (
    <div className="w-full max-w-xl mx-auto text-center">
      <h2 className="text-3xl md:text-4xl font-150 text-foreground mb-4">Improve, one trade at a time</h2>
      <p className="text-base text-secondary mb-8 leading-relaxed">
        Vestry turns your portfolio history and notes into a clearer picture of
        what works. Start with the demo and see how reflection shapes better
        decisions.
      </p>

      <button
        onClick={onDemoClick}
        className="px-8 py-3 bg-primary text-primary-foreground rounded-md text-base font-130 hover:bg-primary-hover transition-colors cursor-pointer"
      >
        Try Demo Now
      </button>

      <p className="mt-4 text-xs text-muted">No account required. Limited to 3 demo trades.</p>
    </div>
  )
}
