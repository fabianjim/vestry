import { useNextUpdate } from '../hooks/useNextUpdate'

export default function NextUpdateTimer() {
  const { display, isImminent } = useNextUpdate()

  return (
    <div
      className="flex h-7 shrink-0 items-center gap-1.5 px-2 whitespace-nowrap bg-surface border border-border rounded-full"
      title="Portfolio data is updated hourly on trading days (10am-4pm)"
      aria-live="polite"
      aria-label={`Next portfolio update ${display}`}
    >
      <span className="text-[10px] leading-none text-muted font-90">Next Update</span>
      <span
        className={`text-xs leading-none font-130 ${
          isImminent ? 'text-primary' : 'text-foreground'
        }`}
      >
        {display}
      </span>
    </div>
  )
}
