import { preloadApplication } from '../../utils/loadApplication'

interface LandingCTAProps {
  onDemoClick: () => void
  loading: boolean
  error: string | null
}

export default function LandingCTA({ onDemoClick, loading, error }: LandingCTAProps) {
  return (
    <div className="w-full max-w-xl mx-auto text-center">
      <h2 className="text-3xl md:text-4xl font-90 tracking-tight text-foreground mb-4">Improve, one trade at a time</h2>
      <p className="text-base text-secondary mb-8 leading-relaxed">
        Vestry turns your portfolio history and notes into a clearer picture of
        what works. Start with the demo and see how reflection shapes better
        decisions.
      </p>

      <button
        type="button"
        onMouseEnter={preloadApplication}
        onFocus={preloadApplication}
        onClick={onDemoClick}
        disabled={loading}
        className="px-8 py-3 bg-primary text-primary-foreground rounded-md text-base font-130 hover:bg-primary-hover active:bg-primary-active transition-colors disabled:bg-disabled-background disabled:text-disabled-foreground disabled:cursor-not-allowed cursor-pointer"
      >
        {loading ? 'Opening demo…' : 'Try the demo'}
      </button>
      {error && <p role="status" className="mt-3 text-sm text-secondary">{error}</p>}

      <p className="mt-4 text-sm text-secondary">No account required.</p>
      <p className="mt-1 text-xs text-muted">Limited to 3 demo trades.</p>
    </div>
  )
}
