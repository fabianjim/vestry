import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import InfoTooltip from './InfoTooltip'

const hooks = vi.hoisted(() => ({
  states: [] as unknown[], cursor: 0, refCursor: 0,
  effect: undefined as (() => void | (() => void)) | undefined,
  container: { getBoundingClientRect: () => ({ left: 330, width: 40, top: 500, bottom: 540 }), contains: (target: unknown) => target === 'inside' },
  popup: { getBoundingClientRect: () => ({ width: 280, height: 100 }), contains: (target: unknown) => target === 'popup' },
}))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useId: () => 'tooltip-id',
  useCallback: (callback: unknown) => callback,
  useRef: () => ({ current: hooks.refCursor++ === 0 ? hooks.container : hooks.popup }),
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.states)) hooks.states[index] = initial
    return [hooks.states[index], (next: unknown) => {
      hooks.states[index] = typeof next === 'function' ? next(hooks.states[index]) : next
    }]
  },
  useEffect: (effect: () => void | (() => void)) => { hooks.effect = effect },
}))
vi.mock('react-dom', () => ({ createPortal: (children: unknown) => children }))

type Element = ReactElement<Record<string, unknown>>
function find(node: unknown, predicate: (el: Element) => boolean): Element | undefined {
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean)
  if (!node || typeof node !== 'object' || !('props' in node)) return
  const el = node as Element
  if (el.props['aria-hidden']) return
  return predicate(el) ? el : find(el.props.children, predicate)
}

const listeners = new Map<string, (event: unknown) => void>()
let cleanup: (() => void) | undefined
function render() {
  cleanup?.()
  hooks.cursor = 0
  hooks.refCursor = 0
  const root = InfoTooltip({ text: 'Hourly price information' })
  cleanup = hooks.effect?.() || undefined
  const button = find(root, el => el.type === 'button')!
  return { root, button, tooltip: find(root, el => el.props.role === 'tooltip') }
}
function invoke(el: Element, event: string, value: unknown = {}) {
  ;(el.props[event] as (value: unknown) => void)(value)
  return render()
}

beforeEach(() => {
  hooks.states = []
  listeners.clear()
  const events = {
    addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
  }
  vi.stubGlobal('window', { innerWidth: 375, innerHeight: 600, ...events })
  vi.stubGlobal('document', { body: {}, ...events })
})
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals() })

it('opens on tap, describes its button, and stays inside the viewport with the app’s 14px rem', () => {
  const initial = render()
  expect(initial.button.props['aria-expanded']).toBe(false)
  expect(initial.tooltip).toBeUndefined()
  const opened = invoke(initial.button, 'onClick')
  expect(opened.button.props['aria-expanded']).toBe(true)
  expect(opened.button.props['aria-describedby']).toBe(opened.tooltip?.props.id)
  const popup = find(opened.root, el => el.props.style != null)!
  const { left, top } = popup.props.style as { left: number; top: number }
  expect(left).toBeGreaterThanOrEqual(16)
  expect(left + 20 * 14).toBeLessThanOrEqual(375 - 16)
  expect(top).toBe(400) // Flip above a trigger near the bottom of the viewport.
  expect(invoke(opened.button, 'onClick').tooltip).toBeUndefined()
})

it('dismisses on Escape and outside pointers, keeps inside taps open, and removes listeners', () => {
  invoke(render().button, 'onClick')
  listeners.get('pointerdown')!({ target: 'inside' })
  expect(render().tooltip).toBeDefined()
  listeners.get('keydown')!({ key: 'Escape' })
  expect(render().tooltip).toBeUndefined()
  expect(listeners.size).toBe(0)
  invoke(render().button, 'onClick')
  listeners.get('pointerdown')!({ target: 'outside' })
  expect(render().tooltip).toBeUndefined()
  expect(listeners.size).toBe(0)
})

it('keeps desktop hover while letting the first touch tap open the popup', () => {
  expect(invoke(render().root, 'onPointerEnter', { pointerType: 'touch' }).tooltip).toBeUndefined()
  expect(invoke(render().button, 'onClick').tooltip).toBeDefined()
  invoke(render().button, 'onClick')
  expect(invoke(render().root, 'onPointerEnter', { pointerType: 'mouse' }).tooltip).toBeDefined()
  expect(invoke(render().root, 'onPointerLeave', { pointerType: 'mouse' }).tooltip).toBeUndefined()
})
