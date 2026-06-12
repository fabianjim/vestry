import { useNextUpdate } from '../hooks/useNextUpdate'
import InfoTooltip from './InfoTooltip'

export default function NextUpdateTimer() {
  const { display, isImminent } = useNextUpdate()

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-full"
      aria-live="polite"
      aria-label={`Next portfolio update ${display}`}
    >
      <span className="text-xs text-muted font-90">Next Update</span>
      <span
        className={`text-sm font-130 ${
          isImminent ? 'text-primary' : 'text-foreground'
        }`}
      >
        {display}
      </span>
      <InfoTooltip text="Portfolio data is updated hourly on trading days (10am-4pm)" />
    </div>
  )
}
