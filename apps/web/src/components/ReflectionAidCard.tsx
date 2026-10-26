import type { JournalEntry } from '../types/journal'
import type { ReflectionAidResult } from '../types/reflectionAid'
import { formatCurrency, formatSignedCurrencyWithPercent } from '../utils/formatUtils'
import { formatElapsed } from '../utils/dateUtils'
import { getPriceChange } from '../utils/stockStats'

type Props = {
  entry: JournalEntry
  result: ReflectionAidResult
  // entries the panel already has, so a quote can open the entry it came from
  knownEntries: JournalEntry[]
  onEntryClick: (entry: JournalEntry) => void
  now?: Date
}

const ROW = 'flex max-md:flex-wrap max-md:gap-2 justify-between text-sm'

export default function ReflectionAidCard({ entry, result, knownEntries, onEntryClick, now }: Props) {
  const { aid, since } = result
  const priceThen = entry.priceSnapshot != null && entry.priceSnapshot > 0 ? entry.priceSnapshot : null
  const change = getPriceChange(priceThen, since.priceNow)
  const valueColor = change == null || change.diff === 0 ? 'text-foreground' : change.diff > 0 ? 'text-gain' : 'text-loss'
  const hasTicker = !!entry.ticker
  const empty = aid.recap.length === 0 && aid.questions.length === 0

  return (
    <section aria-label="Reflect with AI" className="mb-4 p-4 bg-surface-hover rounded-lg border border-border">
      <h4 className="text-lg font-130 mb-3">Since then</h4>
      <div className="space-y-2">
        <div className={ROW}>
          <span className="text-muted">Time since entry</span>
          <span className="text-foreground">{formatElapsed(entry.timestamp, now)}</span>
        </div>
        {hasTicker && (
          <>
            <div className={ROW}>
              <span className="text-muted">Price then and now</span>
              <span className="text-foreground text-right">
                {priceThen == null ? '—' : formatCurrency(priceThen)} to {since.priceNow == null ? '—' : formatCurrency(since.priceNow)}
                {change && <span className={`block text-xs ${valueColor}`}>{formatSignedCurrencyWithPercent(change.diff, change.percent)}</span>}
              </span>
            </div>
            <div className={ROW}>
              <span className="text-muted">Shares held now</span>
              <span className="text-foreground">{since.sharesNow == null ? '—' : since.sharesNow}</span>
            </div>
            <div className={ROW}>
              <span className="text-muted">Trades since</span>
              <span className="text-foreground">{since.trades.length}</span>
            </div>
          </>
        )}
      </div>

      {aid.recap.length > 0 && (
        <ul className="mt-4 pt-4 border-t border-border space-y-3">
          {aid.recap.map(point => (
            <li key={point.summary} className="text-sm text-foreground">
              {point.summary}
              {point.citations.map(citation => {
                const source = knownEntries.find(known => known.id === citation.entryId)
                const quote = <span className="block text-xs text-secondary">“{citation.quote}”</span>
                return (
                  <blockquote key={`${citation.entryId}-${citation.quote}`} className="mt-1 border-l-2 border-border pl-3">
                    {source ? (
                      <button type="button" onClick={() => onEntryClick(source)}
                        className="text-left hover:underline pointer-coarse:min-h-[40px]">
                        {quote}
                      </button>
                    ) : quote}
                  </blockquote>
                )
              })}
            </li>
          ))}
        </ul>
      )}

      {aid.questions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <h5 className="text-sm font-130 mb-2">Questions to consider</h5>
          <ul className="list-disc pl-5 space-y-2 text-sm text-foreground">
            {aid.questions.map(question => <li key={question}>{question}</li>)}
          </ul>
        </div>
      )}

      {empty && (
        <p className="mt-4 pt-4 border-t border-border text-sm text-muted">
          There isn't much in this entry to reflect on yet.
        </p>
      )}

      <p className="mt-4 text-xs text-muted">
        {`${result.remainingToday} AI ${result.remainingToday === 1 ? 'reflection' : 'reflections'} left today`}
      </p>
    </section>
  )
}
