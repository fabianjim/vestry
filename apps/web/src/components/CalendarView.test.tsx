import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import CalendarView from './CalendarView'

const harness = vi.hoisted(() => ({ states: [] as ReturnType<typeof vi.fn>[] }))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const setter = vi.fn()
    harness.states.push(setter)
    return [typeof initial === 'function' ? initial() : initial, setter]
  },
  useRef: (current: unknown) => ({ current }),
  useMemo: (calculate: () => unknown) => calculate(),
  useEffect: () => {},
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isPending: false }),
  queryOptions: (options: unknown) => options,
}))

type Node = ReactElement<Record<string, unknown>>
function findNode(node: unknown, predicate: (node: Node) => boolean): Node | undefined {
  if (Array.isArray(node)) return node.map(child => findNode(child, predicate)).find(Boolean)
  if (!node || typeof node !== 'object' || !('props' in node)) return undefined
  const element = node as Node
  return predicate(element) ? element : findNode(element.props.children, predicate)
}

function mount() {
  const commit = vi.fn()
  const root = CalendarView({ filters: { from: '2026-09-01', to: '2026-09-01' }, onSelectionChange: commit })
  const grid = findNode(root, node => typeof node.props.onPointerUp === 'function')!
  const day = findNode(root, node => node.props['data-calendar-date'] === '2026-09-03')!
  const capture = { contains: () => true, setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() }
  ;(grid.props.ref as { current: unknown }).current = capture
  const event = {
    button: 0, pointerId: 1, metaKey: false,
    preventDefault: vi.fn(), currentTarget: { focus: vi.fn() },
  }
  const invoke = (node: Node, handler: string) => (node.props[handler] as (event: unknown) => void)(event)
  return { commit, grid, day, capture, invoke, preview: harness.states[1] }
}

beforeEach(() => {
  harness.states = []
  vi.stubGlobal('document', { elementFromPoint: () => null })
})
afterEach(() => vi.unstubAllGlobals())

describe('calendar pointer completion', () => {
  it('keeps the final preview while filters update and ignores capture loss after release', () => {
    const { commit, grid, day, invoke, preview } = mount()
    invoke(day, 'onPointerDown')
    expect(preview).toHaveBeenCalledTimes(1)
    invoke(grid, 'onPointerUp')
    invoke(grid, 'onLostPointerCapture')
    expect(commit).toHaveBeenCalledExactlyOnceWith(['2026-09-03'])
    expect(preview).toHaveBeenCalledTimes(1)
  })

  it('updates once per entered date and commits the final range once', () => {
    const { commit, grid, day, invoke, preview } = mount()
    const target = { dataset: { calendarDate: '2026-09-03' } }
    vi.stubGlobal('document', { elementFromPoint: () => ({ closest: () => target }) })
    invoke(day, 'onPointerDown')
    invoke(grid, 'onPointerMove')
    expect(preview).toHaveBeenCalledTimes(1)
    target.dataset.calendarDate = '2026-09-06'
    invoke(grid, 'onPointerMove')
    invoke(grid, 'onPointerMove')
    expect(preview).toHaveBeenCalledTimes(2)
    expect(commit).not.toHaveBeenCalled()
    invoke(grid, 'onPointerUp')
    invoke(grid, 'onLostPointerCapture')
    expect(commit).toHaveBeenCalledExactlyOnceWith(['2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'])
    expect(preview).toHaveBeenCalledTimes(2)
  })

  it('cancels an interrupted drag without changing the committed dates', () => {
    const { commit, grid, day, invoke, preview, capture } = mount()
    invoke(day, 'onPointerDown')
    invoke(grid, 'onPointerCancel')
    invoke(grid, 'onLostPointerCapture')
    invoke(grid, 'onPointerUp')
    expect(commit).not.toHaveBeenCalled()
    expect(preview).toHaveBeenLastCalledWith(null)
    expect(capture.releasePointerCapture).toHaveBeenCalledTimes(1)
  })
})
