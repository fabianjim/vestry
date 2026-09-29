import { describe, expect, it } from 'vitest'
import { getHoldingColors } from './colors'

describe('holding colors', () => {
  it('keeps colors distinct beyond the base palette and stable when values reorder holdings', () => {
    const tickers = Array.from({ length: 50 }, (_, index) => `T${index}`)
    const colors = getHoldingColors(tickers)
    expect(new Set(colors.values()).size).toBe(tickers.length)
    expect(getHoldingColors([...tickers].reverse())).toEqual(colors)
    expect(getHoldingColors([...tickers, tickers[0]])).toEqual(colors)
  })
})
