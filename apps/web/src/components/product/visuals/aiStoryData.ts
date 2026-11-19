import type { DigestState } from '../../../types/digest'
import type { JournalEntry, Tag } from '../../../types/journal'
import type { ReflectionAidResult } from '../../../types/reflectionAid'

/*
 * Fixtures for the Product page's two AI stories, copied from the demo account on Nov 19, 2026: that day's
 * Portfolio Briefing (the Anthropic IPO), the demo's journal and the saved Reflect with AI aid for the
 * Sep 10 CAVA reflection. The demo changes daily, so these are frozen here. Only NEW_CAVA_REFLECTION is new.
 */

export const STORY_NOW = new Date('2026-11-19T17:05:00Z')

const TAG = {
  ipo: { id: -27, name: 'ipo', color: '#d6965e' },
  ai: { id: -26, name: 'ai', color: '#6366f1' },
  fed: { id: -38, name: 'fed', color: '#f59e0b' },
  loss: { id: -40, name: 'loss', color: '#ef4444' },
} satisfies Record<string, Tag>

const entry = (id: number, entryType: JournalEntry['entryType'], ticker: string | null, timestamp: string,
  priceSnapshot: number | null, tags: Tag[], body: string): JournalEntry =>
  ({ id, entryType, ticker, timestamp, priceSnapshot, tags, body, sourceEntryId: null })

/** The demo journal before the stories add to it, newest first. */
export const DEMO_ENTRIES: JournalEntry[] = [
  entry(-28, 'BUY', 'AMZN', '2026-11-19T16:36:35Z', 269.19, [TAG.ipo, TAG.ai], 'Buying 10 AMZN instead of chasing ANT on day one. Amazon owns about 15% of Anthropic, and AWS is one of its main cloud providers. AMZN popped at the open on the IPO and has already given most of it back, so I’m not paying for the pop. Check for later: if ANT drifts back toward $83 and AMZN follows, I bought the same hype through a side door.'),
  entry(-29, 'REFLECTION', 'LITE', '2026-11-18T19:05:00Z', 554.03, [TAG.ai], 'Bought at $781 a month ago and it’s down about 29%. The AI buildout story hasn’t changed, but I said I wasn’t sure how much was already in the price, and this is the answer. Keeping it small did its job. Holding, not adding.'),
  entry(-30, 'MARKET_EVENT', null, '2026-11-05T19:05:00Z', null, [TAG.ai], 'Broad selloff today. SPY is down about 4%, and the AI names are taking the worst of it: NVDA down about 9%, LITE about 15%. This is the drawdown I planned for on Oct 6. Sleeping on it before doing anything.'),
  entry(-31, 'BUY', 'CAVA', '2026-10-27T14:35:00Z', 50.825, [], 'Adding 10 CAVA near $51. Down almost 40% from my May buy, but same-store sales are still positive and new stores keep opening on schedule. Small add, not trying to call the bottom.'),
  entry(-32, 'BUY', 'LITE', '2026-10-23T16:05:00Z', 781, [TAG.ai], 'Starting a small LITE position, 3 shares. Their optical parts go into nearly every AI data center buildout, and the hyperscalers keep raising spending plans. Not sure how much of that is already in the price, so I’m keeping it small for now.'),
  entry(-33, 'REFLECTION', 'NVDA', '2026-10-19T15:20:00Z', 217.62, [], 'Trimmed at $220.93 in May. Five months, an earnings beat and a record buyback later, it’s back at about the same price after last week’s chip selloff. Still my conviction hold, but conviction hasn’t meant outperformance since spring.'),
  entry(-34, 'BUY', 'SPY', '2026-10-16T18:10:00Z', 763.48, [], 'Nasdaq down about 2% with chips leading a weekly slide. Following my Oct 6 plan: adding 3 shares to SPY as the core holding instead of buying the dip in single names.'),
  entry(-35, 'MARKET_EVENT', null, '2026-10-06T17:30:00Z', null, [], 'S&P 500 joined the Nasdaq at record highs on AI optimism, and the portfolio is near its high too. Writing this down while it’s calm: if we get a sharp drawdown, I add to SPY rather than chase individual names.'),
  entry(-36, 'INSIGHT', 'TSLA', '2026-10-02T14:35:00Z', 368.56, [], 'Q3 deliveries came in around 486k, well above the ~462k expected, and the stock is up about 4%. Still roughly 12% below my entry. Good data point, but my June note still applies: this position runs more on sentiment than on numbers.'),
  entry(-37, 'MARKET_EVENT', null, '2026-09-16T18:25:00Z', null, [TAG.fed], 'Fed raised rates 25bp to 3.75-4.00%, the first hike in three years. Higher for longer weighs more on my growth names (SNOW, TSLA, CAVA) than on SPY. Nothing to do today, just noting the backdrop changed.'),
  entry(-39, 'REFLECTION', 'CAVA', '2026-09-10T15:15:00Z', 55.21, [TAG.loss], 'Down about a third from my buy. Revenue is still growing 30%+ and same-store sales are up 9%, so the business hasn’t broken, the valuation has. I bought right after an earnings pop on excitement. Holding, not adding, and not selling into the slide.'),
]

const byId = (id: number) => DEMO_ENTRIES.find((e) => e.id === id)!

/* Story 1: the briefing points at the Anthropic IPO, and the investor writes it down. */

export const BRIEFING: NonNullable<DigestState['digest']> = {
  id: 'e8efa493-6c6b-40ec-ba0a-eb6cdfd5d16c',
  capturedAt: '2026-11-19T15:00:00Z',
  generatedAt: '2026-11-19T15:00:08Z',
  content: {
    news: 'Anthropic launched the largest IPO ever at $1.5 trillion, reviving interest in AI stocks and contributing to a market rally. NVIDIA’s CEO resignation caused a notable stock drop but recovered partially. SPY saw significant inflows, reflecting strong investor confidence in large-cap equities.',
    reflection: 'With NVIDIA in the portfolio, the CEO change noted before remains a key event. The Anthropic IPO could reinforce AI-related industry trends affecting holdings like LITE and SNOW. Observing market reactions may clarify emerging risks or opportunities.',
    questions: [{ text: 'Record a thought on Anthropic’s IPO impact', destination: 'JOURNAL' }],
    sources: [
      { headline: 'Anthropic to debut on Wall Street with a $1.5 trillion valuation in the biggest IPO of all time', summary: '', publishedOn: null, url: 'https://apnews.com/article/70b660ddf900d90bbf484ecdf1fb441c' },
      { headline: 'Stocks Slip on Nvidia’s CEO Crisis: Stock Market Today', summary: '', publishedOn: null, url: 'https://www.kiplinger.com/investing/stocks/stocks-slip-as-wall-street-weighs-nvidias-ceo-crisis-stock-market-today' },
      { headline: 'ETF Activity: SPY Leads With $6.72 Billion Inflow on Nov. 16', summary: '', publishedOn: null, url: 'https://finance.yahoo.com/markets/stocks/articles/etf-activity-spy-leads-6-110009616.html' },
      { headline: 'Wall Street rallies toward its first gain in 6 days after Anthropic’s IPO revives AI stocks', summary: '', publishedOn: null, url: 'https://apnews.com/article/206c84045137824feabe052a29ff6140' },
    ],
    newsStatus: 'READY',
    demoTemplate: true,
  },
}

/** The sentence the investor highlights; it opens the news paragraph. */
export const IPO_SENTENCE = 'Anthropic launched the largest IPO ever at $1.5 trillion'

export const ANT_BODY = 'Anthropic started trading today as ANT. It priced at $83 and is trading well above that. Not buying, just taking note and adding it to the watchlist. I want to see how much of the move is speculation, momentum or plain hype once the first-day excitement fades. Got indirect exposure through AMZN this morning; ANT itself stays on the watchlist. Same lesson as LITE: a good story isn’t the same as a good price.'

/** What the investor types: the body, then its tags, which Vestry turns into tag pills on save. */
export const ANT_TYPED = `${ANT_BODY} #ipo #ai`

export const ANT_ENTRY = entry(-25, 'MARKET_EVENT', 'ANT', '2026-11-19T16:36:53Z', null, [TAG.ipo, TAG.ai], ANT_BODY)

/* Story 2: the investor rereads the Sep 10 CAVA reflection with AI, then writes a new one. */

export const CAVA_REFLECTION = byId(-39)

export const CAVA_AID: ReflectionAidResult = {
  aid: {
    recap: [{
      summary: 'You added some shares after a notable drop, acknowledging ongoing positive metrics but not attempting to time a bottom.',
      citations: [
        { entryId: -31, quote: 'Adding 10 CAVA near $51.' },
        { entryId: -31, quote: 'Small add, not trying to call the bottom.' },
      ],
    }],
    questions: [
      'How do you feel about your original hold decision now that you’ve added shares during the continued price decline?',
      'What aspects of the business’s performance have most influenced your choice to buy more shares despite the price drop?',
      'Considering your initial reluctance to sell into the slide, what might make you reconsider your position moving forward?',
    ],
  },
  generatedOn: '2026-11-19',
  remainingToday: null,
  since: { priceNow: 52.215, sharesNow: 40, trades: [{ day: '2026-10-27', type: 'BUY', shares: 10, price: 50.825 }] },
}

export const CAVA_REFLECTION_TEXT = 'In September I said hold, not add, then added 10 at $51 in October. Same-store sales were still positive, so I’m fine with it. Next time I’ll write down when I would add before the price falls.'

export const NEW_CAVA_REFLECTION: JournalEntry = {
  id: -100,
  entryType: 'REFLECTION',
  ticker: 'CAVA',
  timestamp: STORY_NOW.toISOString(),
  priceSnapshot: 52.215,
  tags: [],
  body: CAVA_REFLECTION_TEXT,
  sourceEntryId: CAVA_REFLECTION.id,
}
