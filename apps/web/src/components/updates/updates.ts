/*
 * Content for the public Updates page. Entries are written for users and cover only the big changes,
 * grouping related work; refactors, CI and internal fixes stay out. Shipped starts 2026-09-01.
 */

export interface PlannedUpdate {
  title: string
  summary: string
}

export interface ShippedUpdate {
  /** Calendar day, YYYY-MM-DD. */
  date: string
  title: string
  body: string
}

export const PLANNED: PlannedUpdate[] = [
  {
    title: 'Backfill your history',
    summary: 'Import past trades from your brokerage, and write journal entries for decisions you made before Vestry, dated when they happened.',
  },
  {
    title: 'Your own rules',
    summary: 'Write down the rules you invest by, like trimming anything that grows past a quarter of your portfolio, and Hindsight will notice when your trades keep or break them.',
  },
  {
    title: 'Richer entries',
    summary: 'Bring what shaped a decision into the entry itself: the articles you read, the charts and diagrams you sketched, the links you want to come back to.',
  },
]

export const SHIPPED: ShippedUpdate[] = [
  {
    date: '2026-10-31',
    title: 'Insights, from Hindsight',
    body: 'A daily report of up to five behaviors in your own decisions, each with the entries behind it and a question to consider. It observes; it doesn’t advise.',
  },
  {
    date: '2026-10-25',
    title: 'Reflect with AI',
    body: 'Open any journal entry and ask Hindsight to look back with you: the price then and now, the shares you hold now, the trades since, and questions about what you wrote.',
  },
  {
    date: '2026-10-20',
    title: 'Sign in with Google, and Vestry on your phone',
    body: 'Sign in with your Google account. On small screens, Vestry has its own layout with a bottom tab bar and touch gestures on the journal calendar and relationship graph.',
  },
  {
    date: '2026-10-01',
    title: 'Make the dashboard yours',
    body: 'Choose which metrics and sections appear on the dashboard, and arrange holding cards like sector breakdown, concentration and position size vs. return. Your layout is saved. Hindsight can also write you a short daily briefing on your portfolio, drawn from your holdings, recent activity and relevant news.',
  },
]
