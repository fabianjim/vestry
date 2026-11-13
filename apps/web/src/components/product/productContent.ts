/*
 * Content for the public Product page. It sells what Vestry can do and why, not how to use each page.
 * Claims must match current behavior: prices are hourly, and nothing here may read as advice or real-time data.
 */

export interface ProductPoint {
  title: string
  body: string
}

export interface ProductSection {
  /** Anchor id, e.g. /product#journal. */
  id: string
  /** Label in the "On this page" list. */
  label: string
  headline: string
  lede: string
  points: ProductPoint[]
  /** From xl: 'split' puts the headline left and the text right; 'side' puts the visual beside the lede. */
  layout?: 'split' | 'side'
  /** A closing link under the points, e.g. to the full policy. */
  link?: { label: string; to: string }
}

export const PRODUCT_SECTIONS: ProductSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    layout: 'split',
    headline: 'A journal for the decisions behind your portfolio.',
    lede: 'Vestry connects your portfolio’s history (prices, holdings, trades, profit and loss) with the reasoning behind each decision. It’s built for investors who make considered decisions and want to learn from their own record.',
    points: [
      { title: 'What it isn’t', body: 'Vestry isn’t a brokerage and never places trades. Prices update hourly, not tick by tick. It doesn’t make predictions or tell you what to buy or sell; it helps you see your own decisions clearly.' },
    ],
  },
  {
    id: 'journal',
    label: 'Journal',
    layout: 'side',
    headline: 'Write down why, while you still know.',
    lede: 'Every entry is stamped with the time and the price at that moment, so you can come back to what you actually thought, not what you remember thinking.',
    points: [],
  },
  {
    id: 'analysis',
    label: 'Analysis',
    headline: 'Shape your analysis around your own questions.',
    lede: 'Analysis runs through all of Vestry, not just one page. What each company is, how each position has done, how your portfolio has moved and how prices changed after you wrote, all rebuilt from your own trades so every number reflects what you actually owned.',
    points: [
      { title: 'Know what you own', body: 'Every stock shows its sector, industry, country and company size, and every fund its asset class, category and region. The same details link related holdings in a relationship graph.' },
      { title: 'Every position in full', body: 'Shares, average cost, market value, realized and unrealized gain or loss, and price history with daily and weekly ranges.' },
      { title: 'Your portfolio over time', body: 'Chart its value or gain over a week, a month, three months, all time or dates you choose, against the money you put in, with your journal entries marked where you wrote them.' },
      { title: 'Results beside reasoning', body: 'Each entry keeps the price when you wrote it, so you can see how it has moved since and between an entry and your reflection on it.' },
      { title: 'A Holdings page you arrange', body: 'Choose from eight cards, from sector allocation and concentration to position size against return. Reorder, resize or remove them, and your layout is saved.' },
    ],
  },
  {
    id: 'hindsight',
    label: 'Hindsight',
    headline: 'AI that reads your journal, not the market.',
    lede: 'Hindsight is Vestry’s AI. It reads your entries alongside your trades, prices and the news, and points out patterns you may not have noticed. It observes and asks questions. It never tells you what to buy or sell.',
    points: [],
  },
  {
    id: 'data',
    label: 'Your data',
    layout: 'split',
    headline: 'Your journal stays yours.',
    lede: 'A journal only works if you can be honest in it. Vestry keeps what you write private, uses it only to run the features you use, and never turns it into a product.',
    points: [
      { title: 'Nothing linked', body: 'You add your holdings and trades yourself. Vestry never connects to your brokerage and can’t move money or place trades.' },
      { title: 'Not for sale', body: 'Your data isn’t sold or used for advertising. There are no tracking cookies, just the one that keeps you signed in.' },
      { title: 'AI only when it runs', body: 'When Hindsight runs, it sees only the entries and portfolio facts it needs. They aren’t used to train AI models.' },
      { title: 'Yours to keep or remove', body: 'Edit or delete any entry at any time, export your transactions, or ask us for a full copy of your data or to delete your account.' },
    ],
    link: { label: 'Read the privacy policy', to: '/privacy' },
  },
]
