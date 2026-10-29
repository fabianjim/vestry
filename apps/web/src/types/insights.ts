// Kinds, figure keys and units stay strings: hindsight may add new ones, and the page skips what it doesn't know.
export type InsightFigure = { key: string; value: number; unit: string }

// entryExists is false once the quoted entry has been deleted
export type InsightCitation = { entryId: number; quote: string; entryExists: boolean }

export type InsightPattern = {
  kind: string
  subject: string | null
  figures: InsightFigure[]
  observation: string
  question: string
  citations: InsightCitation[]
}

export type InsightNeed = { kind: string; more: number }

export type InsightReport = {
  generatedOn: string
  asOf: string
  entriesUpTo: string | null
  // false only for an empty report hindsight didn't store
  saved: boolean
  patterns: InsightPattern[]
  needs: InsightNeed[]
}

export type InsightsState = {
  report: InsightReport | null
  canRefresh: boolean
  // hindsight couldn't be reached; the rest of vestry works as usual
  unavailable: boolean
}
