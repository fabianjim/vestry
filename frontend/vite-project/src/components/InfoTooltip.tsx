type InfoTooltipProps = {
  text: string
}

export default function InfoTooltip({ text }: InfoTooltipProps) {
  return (
    <div className="group relative">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-muted group-hover:text-secondary cursor-help transition-colors"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-80 p-3 bg-surface-hover border border-border rounded-md text-sm text-secondary opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 shadow-lg">
        {text}
      </div>
    </div>
  )
}
