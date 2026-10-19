import { describe, expect, it } from 'vitest'
import { buildHeroTimeline, heroFrameAt, HERO_PLAYBACK } from './heroTimeline'

const HOUR = 3_600_000
const events = [{ time: 1 * HOUR, chars: 90 }, { time: 4 * HOUR, chars: 35 }]
const timeline = buildHeroTimeline(0, 6 * HOUR, events)

describe('hero timeline', () => {
  it('draws at one horizontal speed and pauses at each event in order', () => {
    const draws = timeline.phases.filter(phase => phase.kind === 'draw')
    expect(draws.map(phase => phase.duration / ((phase.to - phase.from) / HOUR)))
      .toEqual([HERO_PLAYBACK.drawMsPerHour, HERO_PLAYBACK.drawMsPerHour, HERO_PLAYBACK.drawMsPerHour])
    expect(timeline.phases.map(phase => phase.kind === 'pause' ? phase.event : 'draw'))
      .toEqual(['draw', 0, 'draw', 1, 'draw'])
  })

  it('holds the line at an event while its note types out', () => {
    const pause = timeline.phases[1]
    const frame = heroFrameAt(timeline, pause.startMs + HERO_PLAYBACK.enterMs + 1000)
    expect(frame).toMatchObject({ revealTime: 1 * HOUR, visible: 1, typed: [HERO_PLAYBACK.charsPerSecond, 0], done: false })
  })

  it('settles on the complete final state', () => {
    expect(heroFrameAt(timeline, timeline.duration + 1))
      .toEqual({ revealTime: 6 * HOUR, visible: 2, typed: [90, 35], done: true })
  })
})
