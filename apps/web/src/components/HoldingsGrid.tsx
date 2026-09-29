import { createContext, memo, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors, type CollisionDetection } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { useHoldingsLayout } from '../hooks/useHoldingsLayout'
import { useHoldingsMotion } from '../hooks/useHoldingsMotion'
import { holdingSlotAt, type HoldingSlot } from '../utils/holdingsDrag'
import HoldingsPopover from './HoldingsPopover'
import { DEFAULT_HOLDINGS_LAYOUT, HOLDINGS_CARDS, moveHoldingsCard, type HoldingsCard, type HoldingsCardId, type HoldingsLayout } from '../utils/holdingsLayout'

const control = 'rounded px-2 py-1.5 text-sm hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed'
// Let CSS place mixed-width cards at their real destinations during a drag.
const snapToGrid = () => null

const ControlsContext = createContext<ReactNode>(null)
function CardControls() { return useContext(ControlsContext) }
const controlsSlot = <CardControls />
type RenderCard = (card: HoldingsCard, controls: ReactNode, settings: ConcentrationSettings) => ReactNode
// Drag context updates only the controls; chart elements and their state stay intact.
const CardContent = memo(function CardContent({ id, size, render, topN, onTopNChange, disabled }: {
  id: HoldingsCardId; size: 1 | 2; render: RenderCard
} & ConcentrationSettings) {
  return render([id, size], controlsSlot, { topN, onTopNChange, disabled })
})

function Card({ card: [id, size], editing, disabled, index, count, onSize, onMove, onRemove, children }: {
  card: HoldingsCard; editing: boolean; disabled: boolean; index: number; count: number
  onSize: () => void; onMove: (offset: number) => void; onRemove: () => void; children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useSortable({
    id, disabled: !editing || disabled, animateLayoutChanges: () => false,
  })
  const title = HOLDINGS_CARDS[id].title
  const controls = editing && <div className="flex shrink-0 items-center">
    <button ref={setActivatorNodeRef} {...attributes} {...listeners} disabled={disabled}
      aria-label={`Move ${title}`} className={`${control} touch-none cursor-grab active:cursor-grabbing`}>
      <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        {[6, 12, 18].map(y => <g key={y}><circle cx={8} cy={y} r={2} /><circle cx={16} cy={y} r={2} /></g>)}
      </svg>
    </button>
    <HoldingsPopover label={`Options for ${title}`} trigger={
      <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        {[6, 12, 18].map(x => <circle key={x} cx={x} cy={12} r={2} />)}
      </svg>
    } disabled={disabled}>
      <div className="flex flex-col items-stretch text-left">
        <button className={`${control} text-left`} disabled={disabled} onClick={onSize}>Use {size === 1 ? 'large' : 'small'} size</button>
        <button className={`${control} text-left`} disabled={disabled || index === 0} onClick={() => onMove(-1)}>Move up</button>
        <button className={`${control} text-left`} disabled={disabled || index === count - 1} onClick={() => onMove(1)}>Move down</button>
        <button className={`${control} text-left`} disabled={disabled} onClick={onRemove}>Remove card</button>
      </div>
    </HoldingsPopover>
  </div>
  return (
    <section ref={setNodeRef} aria-label={title}
      className={`min-w-0 rounded-lg border bg-surface ${size === 2 ? 'lg:col-span-2' : ''} ${isDragging ? 'opacity-30 border-dashed border-primary' : 'border-border'}`}>
      <ControlsContext.Provider value={controls}>{children}</ControlsContext.Provider>
    </section>
  )
}

export type ConcentrationSettings = { topN: number; onTopNChange: (value: number) => void; disabled: boolean }

export default function HoldingsGrid({ children }: {
  children: RenderCard
}) {
  const { layout, editing, setDraft, query, save, start, cancel, setTopN } = useHoldingsLayout()
  const [active, setActive] = useState<HoldingsCardId | null>(null)
  const [preview, setPreview] = useState<HoldingsLayout | null>(null)
  const displayed = preview ?? layout
  const { frame, grid, scale } = useHoldingsMotion(editing, !query.isPending, active !== null)
  const drag = useRef<{ layout: HoldingsLayout; slots: HoldingSlot[]; target: HoldingsCardId; keyboard: boolean } | null>(null)
  const gridCollision = useCallback<CollisionDetection>(args => {
    const session = drag.current
    const content = grid.current
    if (!session || !content || !args.pointerCoordinates) return closestCenter(args)
    const bounds = content.getBoundingClientRect()
    const scale = bounds.width / content.offsetWidth
    const target = holdingSlotAt(session.slots, {
      x: (args.pointerCoordinates.x - bounds.left) / scale,
      y: (args.pointerCoordinates.y - bounds.top) / scale,
    })
    // Gaps retain the last slot; scrolling and zoom are accounted for by the grid bounds.
    return [{ id: target ?? session.target }]
  }, [grid])
  const topNHandler = useRef(setTopN)
  useLayoutEffect(() => { topNHandler.current = setTopN })
  const onTopNChange = useCallback((value: number) => topNHandler.current(value), [])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const disabled = save.isPending
  const move = (from: HoldingsCardId, to: HoldingsCardId) => setDraft(moveHoldingsCard(layout, from, to))

  return <>
    <div className={`flex items-center justify-between flex-wrap gap-3 mb-4 ${editing
      ? 'sticky top-4 z-40 -mx-3 rounded-2xl border border-foreground/5 bg-background/35 backdrop-blur-xl shadow-sm shadow-background/20 px-3 py-2'
      : ''}`}>
      <h1 className={editing ? 'text-sm font-90 text-secondary' : 'text-xl font-130'}>{editing ? 'Customizing Your Cards...' : 'Your Cards'}</h1>
      <div className="flex flex-wrap items-center gap-1 text-secondary [&_button]:rounded-lg [&_button]:transition-colors">
        {!editing && save.isPending && <span role="status" className="self-center text-xs text-muted">Saving…</span>}
        {editing ? <>
          <HoldingsPopover label="Add cards" trigger="Add cards" disabled={disabled}>
            <fieldset disabled={disabled}>
              <legend className="sr-only">Analysis cards</legend>
              {(Object.keys(HOLDINGS_CARDS) as HoldingsCardId[]).map(id => (
                <label key={id} className="flex gap-2 items-start p-2 rounded text-sm cursor-pointer hover:bg-surface-hover">
                  <input type="checkbox" className="mt-1 accent-primary" checked={layout.cards.some(([card]) => card === id)}
                    onChange={event => setDraft({ ...layout, cards: event.target.checked
                      ? [...layout.cards, [id, id === 'relationships' ? 2 : 1]]
                      : layout.cards.filter(([card]) => card !== id) })} />
                  <span>{HOLDINGS_CARDS[id].title}<span className="block text-xs text-secondary">{HOLDINGS_CARDS[id].description}</span></span>
                </label>
              ))}
            </fieldset>
          </HoldingsPopover>
          <button className={control} disabled={disabled} onClick={() => setDraft(DEFAULT_HOLDINGS_LAYOUT)}>Reset layout</button>
          <span aria-hidden="true" className="mx-2 h-4 w-px bg-foreground/10" />
          <button className={control} disabled={disabled} onClick={cancel}>Cancel</button>
          <button className={`${control} ml-1 inline-flex items-center gap-1.5 bg-foreground/10 text-foreground`} disabled={disabled}
            onClick={() => save.mutate(layout)}>
            <svg aria-hidden="true" className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 8 3 3 7-7" />
            </svg>
            {disabled ? 'Saving…' : 'Done'}
          </button>
        </> : <button className={control} disabled={!query.data || disabled} onClick={start}>Customize</button>}
      </div>
    </div>
    {query.error && <p role="alert" className="text-sm text-error mb-4">
      Could not load your layout. <button className="underline" onClick={() => query.refetch()}>Retry</button>
    </p>}
    {save.error && <p role="alert" className="text-sm text-error mb-4">
      Could not save your changes. {editing ? 'Select Done to retry.' :
        <button className="underline" onClick={() => save.mutate(layout)}>Retry</button>}
    </p>}
    {query.isPending ? <p className="text-sm text-muted">Loading layout…</p> : <>
      {!layout.cards.length && <p className="text-sm text-muted py-8">No analysis cards selected. Use Customize to add one.</p>}
      <DndContext sensors={sensors} collisionDetection={gridCollision}
        onDragStart={({ active: item, activatorEvent }) => {
          drag.current = {
            layout, target: item.id as HoldingsCardId, keyboard: activatorEvent.type === 'keydown',
            slots: Array.from(grid.current?.children ?? []).map((element, index) => {
              const node = element as HTMLElement
              return { id: layout.cards[index][0], x: node.offsetLeft, y: node.offsetTop,
                width: node.offsetWidth, height: node.offsetHeight }
            }),
          }
          setPreview(layout)
          setActive(item.id as HoldingsCardId)
        }}
        onDragOver={({ active: item, over }) => {
          const session = drag.current
          if (!session || session.keyboard || !over || session.target === over.id) return
          session.target = over.id as HoldingsCardId
          setPreview(moveHoldingsCard(session.layout, item.id as HoldingsCardId, session.target))
        }}
        onDragCancel={() => {
          drag.current = null
          setPreview(null)
          setActive(null)
        }}
        onDragEnd={({ active: item, over }) => {
          const session = drag.current
          if (over && session) {
            setDraft(moveHoldingsCard(session.layout, item.id as HoldingsCardId, over.id as HoldingsCardId))
          }
          drag.current = null
          setPreview(null)
          setActive(null)
        }}>
        <SortableContext items={displayed.cards.map(([id]) => id)} strategy={snapToGrid}>
          <div ref={frame} className="relative overflow-clip transition-[height] duration-250 motion-reduce:transition-none">
          <div ref={grid} style={{ transform: `scale(${scale})` }}
            className="absolute inset-x-0 top-0 origin-top grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch transition-transform duration-250 motion-reduce:transition-none">
            {displayed.cards.map((card, index) => <Card key={card[0]} card={card} index={index} count={layout.cards.length}
              editing={editing} disabled={disabled}
              onSize={() => setDraft({ ...layout, cards: layout.cards.map(([id, size]) => [id, id === card[0] ? size === 1 ? 2 : 1 : size]) })}
              onMove={offset => move(card[0], layout.cards[index + offset][0])}
              onRemove={() => setDraft({ ...layout, cards: layout.cards.filter(([id]) => id !== card[0]) })}>
              <CardContent id={card[0]} size={card[1]} render={children}
                topN={layout.topN ?? 3} onTopNChange={onTopNChange} disabled={disabled || !query.data} />
            </Card>)}
          </div>
          </div>
        </SortableContext>
        {typeof document !== 'undefined' && createPortal(
          // The library otherwise gives this title preview the full card height.
          // Keep it outside the page scroller and clip overflow at the viewport.
          <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden contain-paint">
            <DragOverlay style={{ height: 'auto' }}>
              {active && <div className="rounded-lg border border-primary bg-elevated px-4 py-3 shadow-floating text-sm font-130">{HOLDINGS_CARDS[active].title}</div>}
            </DragOverlay>
          </div>, document.body,
        )}
      </DndContext>
    </>}
  </>
}
