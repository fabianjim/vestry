import { InformationCircleIcon } from './icons'

type InfoTooltipProps = {
  text: string
}

export default function InfoTooltip({ text }: InfoTooltipProps) {
  return (
    <div className="group relative">
      <InformationCircleIcon className="w-4 h-4 text-muted group-hover:text-secondary cursor-help transition-colors" />
      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-80 p-3 bg-surface-hover border border-border rounded-md text-sm text-secondary opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 shadow-lg">
        {text}
      </div>
    </div>
  )
}
