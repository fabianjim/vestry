import { useNextUpdate } from '../hooks/useNextUpdate'

export default function NextUpdateTimer() {
  const { display, isImminent } = useNextUpdate()

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 whitespace-nowrap bg-surface border border-border rounded-full"
      title="Portfolio data is updated hourly on trading days (10am-4pm)"
      aria-live="polite"
      aria-label={`Next portfolio update ${display}`}
    >
      <span className="text-[10px] text-muted font-90">Next Update</span>
      <span
        className={`text-xs font-130 ${
          isImminent ? 'text-primary' : 'text-foreground'
        }`}
      >
        {display}
      </span>
    </div>
  )
}
