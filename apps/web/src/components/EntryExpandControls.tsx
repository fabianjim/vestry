import { ChevronDownUpIcon, ChevronRightIcon, ChevronUpDownIcon } from './icons'

interface ExpandAllButtonProps {
  anyExpanded: boolean
  onClick: () => void
  className?: string
}

export function ExpandAllButton({ anyExpanded, onClick, className = '' }: ExpandAllButtonProps) {
  const label = anyExpanded ? 'Collapse all entries' : 'Expand all entries'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center rounded-md text-muted hover:text-foreground hover:bg-surface-hover active:bg-surface-active transition-colors pointer-coarse:min-h-[40px] pointer-coarse:min-w-[40px] ${className}`}
    >
      {anyExpanded ? <ChevronDownUpIcon className="w-4 h-4" /> : <ChevronUpDownIcon className="w-4 h-4" />}
    </button>
  )
}

interface EntryToggleButtonProps {
  expanded: boolean
  onToggle: () => void
}

export function EntryToggleButton({ expanded, onToggle }: EntryToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      aria-expanded={expanded}
      aria-label={expanded ? 'Collapse entry' : 'Expand entry'}
      className="-m-1 p-1 rounded text-muted hover:text-foreground transition-colors pointer-coarse:-m-2 pointer-coarse:p-3"
    >
      <ChevronRightIcon className={`w-3.5 h-3.5 transition-transform duration-300 motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`} />
    </button>
  )
}
