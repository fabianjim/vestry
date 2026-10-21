import { GLASS_TOOLTIP_CLASS } from '../utils/chartTooltip'

/** Tooltip for the holdings cards: a bold title over plain data, or `title: value` on one line for a single value. */
export default function HoldingTooltip({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className={`${GLASS_TOOLTIP_CLASS} p-3 text-sm text-foreground`}>
      {lines.length === 1 ? (
        <p className="whitespace-nowrap"><span className="font-130">{title}:</span> <span className="text-secondary">{lines[0]}</span></p>
      ) : <>
        <p className="font-130 mb-1">{title}</p>
        {lines.map(line => <p key={line} className="text-secondary">{line}</p>)}
      </>}
    </div>
  )
}
