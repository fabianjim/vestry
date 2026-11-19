import type { Source } from '../types/source'

/** The domain of an http(s) URL without `www.`, or null when there isn't one. */
export function sourceHost(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const { protocol, hostname } = new URL(url)
    if (protocol !== 'https:' && protocol !== 'http:') return null
    return hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/** A safe href for a source, or null so it renders as plain text. */
export function sourceHref(source: Source): string | null {
  return sourceHost(source.url) ? source.url! : null
}

export function sourceName(source: Source): string {
  return source.publisher?.trim() || sourceHost(source.url) || source.title
}

/** Sent to DuckDuckGo with the domain only; the image falls back to a letter when it fails. */
export function faviconUrl(source: Source): string | null {
  const host = sourceHost(source.url)
  return host ? `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico` : null
}

export function sourceInitial(source: Source): string {
  return (sourceName(source).match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase()
}

/** A yyyy-mm-dd date as "mm/dd". */
export function formatSourceDate(day: string | null | undefined): string | null {
  const match = day?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return `${match[2]}/${match[3]}`
}
