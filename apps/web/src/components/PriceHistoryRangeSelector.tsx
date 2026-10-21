import type { PriceHistoryRange } from '../utils/priceHistory'
import SegmentedControl from './SegmentedControl'

type Props = {
  value: PriceHistoryRange
  onChange: (range: PriceHistoryRange) => void
}

const RANGES = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'all', label: 'All' },
] as const

export default function PriceHistoryRangeSelector({ value, onChange }: Props) {
  return <SegmentedControl label="Price history period" options={RANGES} value={value} onChange={onChange} />
}
