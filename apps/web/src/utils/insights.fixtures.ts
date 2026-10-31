import type { Behavior, BehaviorFigure, BehaviorReport, InsightsOverview } from '../types/insights'

// Test data shaped like the demo account's report: four behaviors, one whose results aren't known yet
// (anxious trims, before sell outcomes land), and one kind the page doesn't know.

const UNITS: Record<string, string> = {
  pnl: 'money', avg_pnl: 'money', possible_monthly_loss: 'money',
  avg_return: 'fraction', avg_weight: 'fraction', largest_weight: 'fraction', sector_weight: 'fraction', median_run_up: 'fraction',
  median_days: 'days',
}

export const figures = (values: Record<string, number>): BehaviorFigure[] => Object.entries(values).map(([key, value]) => ({
  key, value, unit: UNITS[key.replace(/^baseline_/, '')] ?? 'count',
}))

export const behavior = (kind: string, subject: string | null, values: Record<string, number>, rest: Partial<Behavior> = {}): Behavior => ({
  kind, subject, figures: figures(values), previous: null,
  observation: '', question: '', citations: [], trades: [], entries: [], feedback: null, notes: [],
  ...rest,
})

export const demoReport: BehaviorReport = {
  day: '2026-10-30',
  generatedAt: '2026-10-30T07:45:00Z',
  asOf: '2026-10-29',
  entriesUpTo: '2026-10-29T20:00:00Z',
  behaviors: [
    behavior('price_action', null, {
      decisions: 5, outcomes: 5, pnl: 1240, avg_pnl: 248, avg_return: 0.084, gains: 4,
      baseline_decisions: 6, baseline_outcomes: 5, baseline_pnl: 2210, baseline_avg_pnl: 442, baseline_avg_return: 0.121, baseline_gains: 4,
    }, {
      previous: { day: '2026-10-27', figures: figures({ decisions: 4, avg_return: 0.061 }) },
      observation: 'Several buys followed a stock that was already climbing, and you wrote about the move more than the business.',
      question: 'What would you have needed to see before buying if the price had been flat?',
      citations: [
        { entryId: 21, quote: 'It keeps going up, I don’t want to be left behind', entryExists: true },
        { entryId: 22, quote: 'removed words', entryExists: false },
      ],
    }),
    behavior('emotional', 'anxious', {
      decisions: 4,
      baseline_decisions: 7, baseline_outcomes: 6, baseline_pnl: 900, baseline_avg_pnl: 150, baseline_avg_return: 0.04, baseline_gains: 4,
    }, {
      observation: 'When you wrote about feeling anxious, you trimmed rather than added.',
      question: 'What were you protecting when you trimmed?',
      citations: [{ entryId: 31, quote: 'Feeling uneasy, taking a little off the table', entryExists: true }],
    }),
    behavior('risk_concentration', null, {
      decisions: 2, outcomes: 2, pnl: 3100, avg_pnl: 1550, avg_return: 0.22, gains: 2,
      possible_monthly_loss: 1840, largest_weight: 0.31, sector_weight: 0.58,
    }, {
      // hindsight drops text that breaks its rules; a blank one still shows its figures
      observation: '',
      question: '',
    }),
    behavior('position_sizing', null, {
      decisions: 3, outcomes: 3, pnl: -420, avg_pnl: -140, avg_return: -0.035, gains: 1,
      baseline_decisions: 9, baseline_outcomes: 8, baseline_pnl: 1900, baseline_avg_pnl: 237.5, baseline_avg_return: 0.05, baseline_gains: 6,
      avg_weight: 0.24, baseline_avg_weight: 0.07, large_low_conviction: 2, possible_monthly_loss: 950,
    }, {
      observation: 'Your largest buys were the ones you wrote least about.',
      question: 'What makes a position worth its size to you?',
      citations: [{ entryId: 41, quote: 'Going big on this one', entryExists: true }],
      feedback: { reaction: 'FITS', note: null },
    }),
    behavior('news_drift', null, { decisions: 3 }, { observation: 'A kind the page does not know' }),
  ],
  needs: [
    { kind: 'no_plan', subject: null, more: 2, reason: 'ENTRIES' },
    { kind: 'loss_aversion', subject: null, more: 1, reason: 'TRADES' },
    { kind: 'news_drift', subject: null, more: 1, reason: 'TRADES' },
  ],
}

export const overview = (values: Partial<InsightsOverview> = {}): InsightsOverview => ({
  status: 'IDLE', canGenerate: false, blockedReason: 'UPDATED_TODAY', hasOlder: false, unavailable: false, lastRun: null,
  reports: [{ day: demoReport.day, generatedAt: demoReport.generatedAt, behaviors: demoReport.behaviors.map(({ kind, subject, figures }) => ({ kind, subject, figures })) }],
  ...values,
})
