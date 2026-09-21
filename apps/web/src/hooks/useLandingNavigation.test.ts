import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLandingNavigation as installNavigation } from './useLandingNavigation'

vi.mock('react', () => ({ useEffect: (effect: () => void) => effect() }))

afterEach(() => vi.unstubAllGlobals())

function setup(scrollY: number, heights = [671, 671, 671, 671]) {
  let onKeyDown: (event: KeyboardEvent) => void = () => {}
  const scrollTo = vi.fn()
  let top = 49
  const sections = heights.map(offsetHeight => {
    const sectionTop = top
    top += offsetHeight
    return { offsetHeight, getBoundingClientRect: () => ({ top: sectionTop - scrollY }) }
  })

  vi.stubGlobal('Element', class {})
  vi.stubGlobal('document', {
    documentElement: { classList: { add: vi.fn(), remove: vi.fn() }, scrollHeight: top + 98 },
    querySelectorAll: () => sections,
  })
  // Reproduce a 7px mismatch between the section inset and computed scroll padding.
  vi.stubGlobal('getComputedStyle', () => ({ scrollPaddingTop: '56px' }))
  vi.stubGlobal('window', {
    innerHeight: 720,
    scrollY,
    scrollTo,
    matchMedia: () => ({ matches: false }),
    addEventListener: (_: string, handler: typeof onKeyDown) => { onKeyDown = handler },
    removeEventListener: vi.fn(),
  })
  installNavigation(true)

  return (key: string, shiftKey = false) => {
    onKeyDown({ key, shiftKey, target: null, preventDefault: vi.fn() } as unknown as KeyboardEvent)
    return scrollTo
  }
}

describe('landing keyboard navigation', () => {
  it.each([
    ['Track', 0, 664],
    ['Reflect', 664, 1335],
    ['Analyze', 1335, 2006],
  ])('advances from %s despite negligible section overflow', (_, current, destination) => {
    const press = setup(current)
    for (const key of ['ArrowDown', ' ']) {
      expect(press(key)).toHaveBeenLastCalledWith({ top: destination, behavior: 'smooth' })
    }
  })

  it('preserves upward navigation', () => {
    const press = setup(1335)
    expect(press('ArrowUp')).toHaveBeenLastCalledWith({ top: 664, behavior: 'smooth' })
    expect(press(' ', true)).toHaveBeenLastCalledWith({ top: 664, behavior: 'smooth' })
  })

  it('keeps intermediate stops for a genuinely tall section', () => {
    const heights = [671, 1500, 671, 671]
    expect(setup(664, heights)('ArrowDown')).toHaveBeenLastCalledWith({ top: 1328, behavior: 'smooth' })
    expect(setup(1328, heights)('ArrowDown')).toHaveBeenLastCalledWith({ top: 1500, behavior: 'smooth' })
  })
})
