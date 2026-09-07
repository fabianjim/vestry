export const TAG_REGEX = /#([A-Za-z][A-Za-z0-9_-]*)/g

export function parseTagsFromBody(text: string): { body: string; tags: string[] } {
  const matches = Array.from(text.matchAll(TAG_REGEX))
  const tagNames = matches.map((m) => m[1].toLowerCase())
  const uniqueTags = Array.from(new Set(tagNames))

  let cleanBody = text.replace(TAG_REGEX, '').replace(/\s+/g, ' ').trim()

  if (uniqueTags.length > 0) {
    cleanBody += '\n\n' + uniqueTags.map((t) => `#${t}`).join(' ')
  }

  return { body: cleanBody, tags: uniqueTags }
}

export function getActiveTagQuery(text: string, cursorPosition: number): { query: string | null; startIndex: number } {
  const textBeforeCursor = text.substring(0, cursorPosition)
  const lastHash = textBeforeCursor.lastIndexOf('#')

  if (lastHash === -1) return { query: null, startIndex: -1 }

  const textAfterHash = textBeforeCursor.substring(lastHash + 1)
  if (textAfterHash.includes(' ') || textAfterHash.includes('\n')) {
    return { query: null, startIndex: -1 }
  }

  if (textAfterHash.length > 0 && !/^[A-Za-z]/.test(textAfterHash)) {
    return { query: null, startIndex: -1 }
  }

  return { query: textAfterHash.toLowerCase(), startIndex: lastHash }
}

export function getDisplayBody(body: string): string {
  const lastDoubleNewline = body.lastIndexOf('\n\n')
  if (lastDoubleNewline === -1) return body

  const afterNewline = body.substring(lastDoubleNewline + 2)
  const parts = afterNewline.split(/\s+/)
  if (parts.length > 0 && parts.every((part) => /^#[A-Za-z][A-Za-z0-9_-]*$/.test(part))) {
    return body.substring(0, lastDoubleNewline).trimEnd()
  }

  return body
}

export function getTagsFromBody(body: string): string[] {
  const matches = Array.from(body.matchAll(TAG_REGEX))
  return Array.from(new Set(matches.map((m) => m[1].toLowerCase())))
}
