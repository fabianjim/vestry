import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Tooltip, type TooltipContentProps, type TooltipProps } from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'

type Props = Omit<TooltipProps<ValueType, NameType>, 'content' | 'wrapperStyle'> & {
  render: (props: TooltipContentProps<ValueType, NameType>) => ReactNode
}

/** Calls `onDrawn` once, after the browser has drawn a frame with its children placed. */
function Drawn({ onDrawn, children }: { onDrawn: () => void; children: ReactNode }) {
  useEffect(() => {
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(onDrawn) })
    return () => cancelAnimationFrame(frame)
  }, [onDrawn])
  return children
}

/*
 * A tooltip for item charts (scatter points, pie slices) that glides from the last item instead of
 * the chart's top-left corner. Recharts places a tooltip by measuring it, and content that renders
 * nothing while hidden measures 0×0, which drops the placement. So the last content stays rendered
 * (Recharts keeps it hidden) to keep the place. The first appearance has no place to glide from,
 * so the glide stays off until the tooltip has been drawn once.
 */
export default function ItemTooltip({ render, ...props }: Props) {
  const last = useRef<ReactNode>(null)
  const [placed, setPlaced] = useState(false)
  const onDrawn = useCallback(() => setPlaced(true), [])
  return <Tooltip {...props}
    wrapperStyle={placed ? undefined : { transition: 'none' }}
    content={(contentProps: TooltipContentProps<ValueType, NameType>) => {
      const node = render(contentProps)
      if (node) last.current = node
      return last.current ? <Drawn onDrawn={onDrawn}>{last.current}</Drawn> : null
    }} />
}
