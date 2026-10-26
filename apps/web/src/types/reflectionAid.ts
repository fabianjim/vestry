export type ReflectionCitation = { entryId: number; quote: string }

export type ReflectionAidResult = {
  aid: {
    recap: { summary: string; citations: ReflectionCitation[] }[]
    questions: string[]
  }
  generatedOn: string
  remainingToday: number
  // vestry's own numbers, recomputed on every request
  since: {
    priceNow: number | null
    sharesNow: number | null
    trades: { day: string; type: 'BUY' | 'SELL'; shares: number; price: number }[]
  }
}
