import type { JournalEntryType } from '../types/journal'

// Literal utility names allow Tailwind to discover every journal variant.
// Chart marks use the same CSS tokens as badges, without coupling trades to P/L.
export const JOURNAL_STYLES: Record<JournalEntryType, {
  label: string
  badge: string
  color: string
}> = {
  BUY: { label: 'Buy', badge: 'text-buy bg-buy-soft border-buy-border', color: 'var(--color-buy)' },
  SELL: { label: 'Sell', badge: 'text-sell bg-sell-soft border-sell-border', color: 'var(--color-sell)' },
  INSIGHT: { label: 'Insight', badge: 'text-insight bg-insight-soft border-insight-border', color: 'var(--color-insight)' },
  REFLECTION: { label: 'Reflect', badge: 'text-reflection bg-reflection-soft border-reflection-border', color: 'var(--color-reflection)' },
  MARKET_EVENT: { label: 'Market event', badge: 'text-event bg-event-soft border-event-border', color: 'var(--color-event)' },
}

export function journalBadge(type: JournalEntryType): string {
  return `inline-flex items-center px-2 py-0.5 rounded border text-xs font-130 ${JOURNAL_STYLES[type].badge}`
}
