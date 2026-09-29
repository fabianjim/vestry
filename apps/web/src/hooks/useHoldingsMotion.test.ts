import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({ refs: [] as { current: unknown }[], effects: [] as (() => unknown)[], cursor: 0 }))
vi.mock('react', () => ({
  useRef: (value: unknown) => harness.refs[harness.cursor++] ?? (harness.refs[harness.cursor - 1] = { current: value }),
  useLayoutEffect: (effect: () => unknown) => { harness.effects.push(effect) },
}))
import { useHoldingsMotion } from './useHoldingsMotion'

let reduced = false
let transform = 'none'
const resize = { observe: vi.fn(), disconnect: vi.fn() }
function Render(zoomed = false, dragging = false) {
  harness.cursor = 0
  harness.effects = []
  useHoldingsMotion(zoomed, true, dragging)
}
function card(x: number, y: number) {
  return {
    offsetLeft: x, offsetTop: y,
    animate: vi.fn<(frames: Keyframe[], options: KeyframeAnimationOptions) => { cancel: ReturnType<typeof vi.fn>; onfinish: null }>(() => ({ cancel: vi.fn(), onfinish: null })),
  }
}
beforeEach(() => {
  harness.refs = []
  reduced = false
  transform = 'none'
  vi.stubGlobal('window', { matchMedia: () => ({ matches: reduced }) })
  vi.stubGlobal('getComputedStyle', () => ({ transform }))
  vi.stubGlobal('DOMMatrixReadOnly', class { m41 = 0; m42 = 80 })
  vi.stubGlobal('ResizeObserver', class { observe = resize.observe; disconnect = resize.disconnect })
})
afterEach(() => vi.unstubAllGlobals())

describe('holdings layout motion', () => {
  it('animates only displaced cards and continues from an interrupted visual position', () => {
    const moving = card(0, 0)
    const stationary = card(500, 0)
    Render()
    harness.refs[1].current = { children: [moving, stationary] }
    harness.effects[1]()
    expect(moving.animate).not.toHaveBeenCalled()

    moving.offsetTop = 300
    Render()
    harness.effects[1]()
    expect(moving.animate.mock.calls[0]).toEqual([
      [{ transform: 'translate(0px, -300px)' }, { transform: 'translate(0, 0)' }],
      { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    ])
    expect(stationary.animate).not.toHaveBeenCalled()

    const previous = moving.animate.mock.results[0].value
    transform = 'matrix(1,0,0,1,0,80)'
    moving.offsetTop = 0
    Render()
    harness.effects[1]()
    expect(previous.cancel).toHaveBeenCalledOnce()
    expect(moving.animate.mock.calls[1][0][0].transform).toBe('translate(0px, 380px)')
  })

  it('respects reduced motion and uses scaled content height only while zoomed', () => {
    const moving = card(0, 0)
    const frame = { style: { height: '' } }
    Render(true)
    harness.refs[0].current = frame
    harness.refs[1].current = { offsetHeight: 1000, children: [moving] }
    harness.effects[0]()
    harness.effects[1]()
    expect(frame.style.height).toBe('880px')

    reduced = true
    moving.offsetTop = 300
    Render(false)
    harness.effects[0]()
    harness.effects[1]()
    expect(moving.animate).not.toHaveBeenCalled()
    expect(frame.style.height).toBe('1000px')
  })

  it('keeps scroll height from shrinking during reflow and releases it after drop', () => {
    const frame = { style: { height: '880px' } }
    Render(true, true)
    harness.refs[0].current = frame
    harness.refs[1].current = { offsetHeight: 600, children: [] }
    harness.effects[0]()
    expect(frame.style.height).toBe('880px')
    Render(true, false)
    harness.effects[0]()
    expect(frame.style.height).toBe('528px')
  })

})
