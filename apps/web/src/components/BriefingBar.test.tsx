import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import BriefingBar from './BriefingBar'

it.each([false, true])('retains the body for animation and gates collapsed interaction (expanded=%s)', expanded => {
  const html = renderToStaticMarkup(<BriefingBar expanded={expanded} disabled={false} onToggle={() => {}}>
    <button>Explore holdings</button>
  </BriefingBar>)
  expect(html).toContain('Explore holdings')
  expect(html).toContain(`aria-expanded="${expanded}"`)
  expect(html).toContain(`<div id="${html.match(/aria-controls="([^"]+)"/)![1]}"`)
  expect(html.includes('inert=""')).toBe(!expanded)
  expect(html).toContain(`aria-hidden="${!expanded}"`)
  expect(html).not.toMatch(/\shidden=/)
})
