// Behavior reports, mirroring InsightsService's views.
// Kinds, figure keys and units stay strings: hindsight may add new ones, and the page skips what it doesn't know.

// entryExists is false once the quoted entry has been deleted
export type InsightCitation = { entryId: number; quote: string; entryExists: boolean }

/** Figures are counted by vestry and hindsight, never written by the model. */
export type BehaviorFigure = { key: string; value: number; unit: string }

// "need more" is ENTRIES, TRADES, PRICES or FIELDS
export type BehaviorNeed = { kind: string; subject: string | null; more: number; reason: string }

export type BehaviorSummary = { kind: string; subject: string | null; figures: BehaviorFigure[] }

export type ReportSummary = { day: string; generatedAt: string; behaviors: BehaviorSummary[] }

export type InsightsStatus = 'IDLE' | 'GENERATING' | 'FAILED_TODAY'

export type GenerateBlocked = 'UPDATED_TODAY' | 'NOTHING_NEW' | 'FAILED_TODAY'

// A run today that saved nothing; shown until the next one starts
export type LastRun = { outcome: 'UNAVAILABLE' | 'EMPTY'; at: string; needs: BehaviorNeed[] }

export type InsightsOverview = {
  status: InsightsStatus
  canGenerate: boolean
  blockedReason: GenerateBlocked | null
  // newest first
  reports: ReportSummary[]
  hasOlder: boolean
  // hindsight couldn't be reached; the rest of vestry works as usual
  unavailable: boolean
  lastRun: LastRun | null
}

export type BehaviorPrevious = { day: string; figures: BehaviorFigure[] }

// A trade or entry deleted since the report keeps its ID, with the rest null
export type BehaviorTrade = {
  tradeId: number
  tradeExists: boolean
  ticker: string | null
  side: string | null
  shares: number | null
  price: number | null
  timestamp: string | null
}

export type BehaviorEntry = {
  entryId: number
  entryExists: boolean
  entryType: string | null
  ticker: string | null
  timestamp: string | null
  body: string | null
}

export type BehaviorNote = { entryId: number; timestamp: string; body: string }

export type BehaviorReaction = 'FITS' | 'DOESNT_FIT' | 'KNEW'

export type Behavior = {
  kind: string
  subject: string | null
  figures: BehaviorFigure[]
  previous: BehaviorPrevious | null
  observation: string
  question: string
  citations: InsightCitation[]
  trades: BehaviorTrade[]
  entries: BehaviorEntry[]
  feedback: { reaction: BehaviorReaction; note: string | null } | null
  notes: BehaviorNote[]
}

export type BehaviorReport = {
  day: string
  generatedAt: string
  asOf: string
  entriesUpTo: string | null
  behaviors: Behavior[]
  needs: BehaviorNeed[]
}

export type OlderReports = { reports: ReportSummary[]; hasOlder: boolean; unavailable: boolean }

export type FeedbackRequest = {
  kind: string
  subject: string | null
  reportDay: string
  reaction: BehaviorReaction
  note: string | null
}
