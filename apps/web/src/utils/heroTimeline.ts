/*
 * Schedule for the landing hero: the line draws at one constant horizontal speed, stops at each
 * event while its card enters and its note types out, then resumes. Every frame derives from one clock.
 */

// About 12 seconds for the landing day; Skip jumps to the end.
export const HERO_PLAYBACK = {
  delayMs: 500,
  drawMsPerHour: 900,
  enterMs: 350,
  charsPerSecond: 60,
  holdMs: 400,
}

type Phase =
  | { kind: 'draw'; startMs: number; duration: number; from: number; to: number }
  | { kind: 'pause'; startMs: number; duration: number; event: number }

export type HeroTimeline = {
  start: number
  end: number
  chars: number[]
  phases: Phase[]
  duration: number
  options: typeof HERO_PLAYBACK
}

export type HeroFrame = {
  /** Chart time the line has reached. */
  revealTime: number
  /** Number of events whose marker and card are shown. */
  visible: number
  /** Characters typed per event body. */
  typed: number[]
  done: boolean
}

const HOUR_MS = 3_600_000

export function buildHeroTimeline(
  start: number, end: number, events: { time: number; chars: number }[], options = HERO_PLAYBACK,
): HeroTimeline {
  const phases: Phase[] = []
  let cursor = options.delayMs
  let position = start
  const draw = (to: number) => {
    const duration = (to - position) / HOUR_MS * options.drawMsPerHour
    if (duration > 0) phases.push({ kind: 'draw', startMs: cursor, duration, from: position, to })
    cursor += duration
    position = to
  }
  events.forEach((event, index) => {
    draw(Math.min(Math.max(event.time, position), end))
    const duration = options.enterMs + event.chars / options.charsPerSecond * 1000 + options.holdMs
    phases.push({ kind: 'pause', startMs: cursor, duration, event: index })
    cursor += duration
  })
  draw(end)
  return { start, end, chars: events.map(event => event.chars), phases, duration: cursor, options }
}

export function heroFrameAt(timeline: HeroTimeline, elapsedMs: number): HeroFrame {
  const { chars, options } = timeline
  const frame: HeroFrame = { revealTime: timeline.start, visible: 0, typed: chars.map(() => 0), done: false }
  for (const phase of timeline.phases) {
    if (elapsedMs < phase.startMs) break
    const into = Math.min(elapsedMs - phase.startMs, phase.duration)
    if (phase.kind === 'draw') {
      frame.revealTime = phase.from + (phase.to - phase.from) * (into / phase.duration)
    } else {
      frame.visible = phase.event + 1
      const typing = (into - options.enterMs) / 1000 * options.charsPerSecond
      frame.typed[phase.event] = Math.max(0, Math.min(chars[phase.event], Math.floor(typing)))
    }
  }
  frame.done = elapsedMs >= timeline.duration
  if (frame.done) {
    frame.revealTime = timeline.end
    frame.visible = chars.length
    frame.typed = [...chars]
  }
  return frame
}

/** Linear value at a chart time, for the running portfolio total. */
export function valueAtTime(points: { time: number; value: number }[], time: number): number {
  if (!points.length) return 0
  if (time <= points[0].time) return points[0].value
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (time <= b.time) return a.value + (b.value - a.value) * ((time - a.time) / (b.time - a.time))
  }
  return points[points.length - 1].value
}
