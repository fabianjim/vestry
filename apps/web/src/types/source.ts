/**
 * Where a claim came from: a briefing's news article today, and later a link or note a user
 * attaches to an entry. Only `title` is required, so a source without a URL (a filing, a book,
 * a conversation) still renders.
 */
export type Source = {
  title: string
  url?: string | null
  /** A display name such as "Reuters"; the URL's domain is used when absent. */
  publisher?: string | null
  /** ISO date (yyyy-mm-dd). */
  publishedOn?: string | null
}
