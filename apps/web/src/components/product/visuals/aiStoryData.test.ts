import { describe, expect, it } from 'vitest'
import { ANT_ENTRY, ANT_TYPED, BRIEFING, CAVA_AID, DEMO_ENTRIES, IPO_SENTENCE } from './aiStoryData'
import { getDisplayBody, parseTagsFromBody } from '../../../utils/tagUtils'

describe('Product page AI stories', () => {
  it('quotes the aid word for word from entries the story shows, as the aid card links them', () => {
    for (const { entryId, quote } of CAVA_AID.aid.recap.flatMap(point => point.citations)) {
      expect(DEMO_ENTRIES.find(entry => entry.id === entryId)?.body).toContain(quote)
    }
  })

  it('highlights the opening of the briefing and saves what was typed', () => {
    expect(BRIEFING.content.news.startsWith(IPO_SENTENCE)).toBe(true)
    const { body, tags } = parseTagsFromBody(ANT_TYPED)
    expect(getDisplayBody(body)).toBe(ANT_ENTRY.body)
    expect(tags).toEqual(ANT_ENTRY.tags.map(tag => tag.name))
  })
})
