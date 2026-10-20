import { expect, test, type Page } from '@playwright/test'

/** Visible elements that extend past the viewport, outside an intentional [data-scroll-x] region. */
function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const describe = (el: Element) => {
      const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? ''
      return `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 4).join('.')} "${name}"`
    }
    const offenders: string[] = []
    for (const el of document.body.querySelectorAll('*')) {
      if (el.closest('[data-scroll-x], .sr-only')) continue
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.opacity === '0') continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const scrollsSideways = ['auto', 'scroll'].includes(style.overflowX) && el.scrollWidth > el.clientWidth + 1
      if (rect.right > width + 1 || rect.left < -1 || scrollsSideways) offenders.push(describe(el))
    }
    return offenders.slice(0, 10)
  })
}

// Each run saves a screenshot per page and project under test-results for review.
async function check(page: Page, name: string) {
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true })
  expect(await horizontalOverflow(page), `${name} overflows horizontally`).toEqual([])
}

test.describe('public pages', () => {
  for (const [name, path] of [['landing', '/'], ['login', '/login']]) {
    test(`${name} fits the viewport`, async ({ page }) => {
      await page.goto(path)
      await check(page, name)
    })
  }
})

test.describe('workspace pages', () => {
  test.beforeEach(async ({ page }) => {
    const response = await page.request.post('/api/auth/login', { data: { username: 'demo', password: 'demo' } })
      .catch(() => null)
    test.skip(!response?.ok(), 'Demo login needs the local API (make dev).')
  })

  for (const name of ['dashboard', 'analysis', 'transactions', 'journal']) {
    test(`${name} fits the viewport`, async ({ page }) => {
      await page.goto(`/${name}`)
      await page.locator('main').waitFor()
      await check(page, name)
    })
  }
})

test.describe('phone interactions', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'Phone-only layout.')
    const response = await page.request.post('/api/auth/login', { data: { username: 'demo', password: 'demo' } })
      .catch(() => null)
    test.skip(!response?.ok(), 'Demo login needs the local API (make dev).')
  })

  test('transaction filters open on tap and narrow the list', async ({ page }) => {
    await page.goto('/transactions')
    const rows = page.locator('main li')
    await rows.first().waitFor()
    await page.getByRole('button', { name: 'Type' }).tap()
    await page.getByRole('checkbox').first().check()
    await page.screenshot({ path: test.info().outputPath('transactions-filter.png') })
    expect(await horizontalOverflow(page)).toEqual([])
    await expect(rows.filter({ hasText: 'SELL' })).toHaveCount(0)
    await expect(rows.filter({ hasText: 'BUY' }).first()).toBeVisible()
  })

  test('relationship graph scrolls with one finger and zooms with two', async ({ page, context }) => {
    await page.goto('/analysis')
    const svg = page.locator('section[aria-label="Holding Relationships"] svg')
    await svg.scrollIntoViewIfNeeded()
    const cdp = await context.newCDPSession(page)
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, number][]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) })
    const zoom = () => svg.locator('> g').getAttribute('transform')
    const box = (await svg.boundingBox())!

    const scrolled = await page.evaluate(() => scrollY)
    await touch('touchStart', [[box.x + 20, box.y + 40]])
    for (let i = 1; i <= 10; i++) await touch('touchMove', [[box.x + 20, box.y + 40 + i * 15]])
    await touch('touchEnd', [])
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(scrolled)
    expect(await zoom()).toBeNull()

    const center = (await svg.boundingBox())!
    const [x, y] = [center.x + center.width / 2, center.y + center.height / 2]
    await touch('touchStart', [[x - 20, y], [x + 20, y]])
    for (let i = 1; i <= 5; i++) await touch('touchMove', [[x - 20 - i * 4, y], [x + 20 + i * 4, y]])
    await touch('touchEnd', [])
    await expect.poll(zoom).toContain('scale(')
    expect(await page.evaluate(() => visualViewport?.scale)).toBe(1)
  })

  test('journal calendar scrolls on vertical swipes and selects on sideways drags', async ({ page, context }) => {
    await page.goto('/journal')
    const calendar = page.locator('[data-calendar-date]')
    await calendar.first().waitFor()
    const cdp = await context.newCDPSession(page)
    const swipe = async (from: { x: number; y: number }, dx: number, dy: number) => {
      const point = (i: number) => [{ x: from.x + dx * i / 10, y: from.y + dy * i / 10, id: 0 }]
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(0) })
      for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(i) })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }
    const center = async (index: number) => {
      const box = (await calendar.nth(index).boundingBox())!
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }

    const scrolled = await page.evaluate(() => scrollY)
    await swipe(await center(14), 0, -150)
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scrolled)
    expect(new URL(page.url()).search).toBe('')

    const start = await center(7)
    const end = await center(9)
    await swipe(start, end.x - start.x, 0)
    await expect.poll(() => new URL(page.url()).search).not.toBe('')
  })

  test('tab bar navigates between workspace pages', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Journal' }).tap()
    await expect(page).toHaveURL(/\/journal$/)
  })
})
