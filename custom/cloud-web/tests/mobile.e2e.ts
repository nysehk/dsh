/** Real login gateway over the assembled dsh UI; no model requests or real keys. */
import { once } from 'node:events'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import type { Browser, Page, Locator } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchWebScaffold, type WebScaffold } from '../../../apps/web/tests/scaffold.ts'
import { connectFreshWorkspaceZh } from '../../../apps/web/tests/support.ts'
import { configureAccount, readAccount } from '../auth.mjs'
import { createGateway, exchangeUpstreamToken } from '../gateway.mjs'

// Browser automation is already owned by apps/web; no new dependency or lockfile change.
const { chromium } = createRequire(new URL('../../../apps/web/package.json', import.meta.url))('playwright')

describe('cloud-web login and mobile configuration', () => {
  let scaffold: WebScaffold
  let gateway: Awaited<ReturnType<typeof createGateway>>
  let browser: Browser
  let page: Page
  let url: string
  const errors: string[] = []
  const screenshots = join(process.cwd(), 'custom/cloud-web/.artifacts')

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ deepSeekMissingCredential: true })
    const directory = join(scaffold.harnessHome, 'cloud-web')
    await configureAccount(directory, 'operator', 'browser-fixture-password-123')
    gateway = await createGateway({ upstream: await exchangeUpstreamToken(scaffold.authenticatedUrl), account: await readAccount(directory) })
    gateway.server.listen(0, '127.0.0.1')
    await once(gateway.server, 'listening')
    const address = gateway.server.address()
    if (address === null || typeof address === 'string') throw new Error('Gateway did not bind TCP.')
    url = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ ...(process.env.DSH_CHROMIUM_PATH ? { executablePath: process.env.DSH_CHROMIUM_PATH } : {}) })
    page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', reducedMotion: 'reduce' })
    page.on('pageerror', error => errors.push(error.message))
    await mkdir(screenshots, { recursive: true })
  }, 120000)

  afterAll(async () => {
    try { await browser?.close() }
    finally { try { await gateway?.close() } finally { await scaffold?.close() } }
  })

  async function fits(surface: Locator, name: string) {
    const box = await surface.boundingBox()
    const width = page.viewportSize()!.width
    expect(box, `${name} must be visible`).not.toBeNull()
    expect(box!.x, `${name} left`).toBeGreaterThanOrEqual(-1)
    expect(box!.x + box!.width, `${name} right`).toBeLessThanOrEqual(width + 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
  }

  it('logs in through the real form and renders a full-width phone shell', async () => {
    await page.goto(url)
    await expect.poll(() => page.locator('h1').innerText()).toBe('登录 DeepSeek Harness')
    await page.screenshot({ path: join(screenshots, 'login-390.png') })
    await page.getByLabel('账号', { exact: true }).fill('operator')
    await page.getByLabel('密码', { exact: true }).fill('browser-fixture-password-123')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.locator('[data-cloud-frame]').waitFor()
    const onboarding = page.getByRole('dialog', { name: '添加一个 API Key 开始使用' })
    await onboarding.getByLabel('API 密钥', { exact: true }).fill('sk-cloud-browser-fixture')
    await onboarding.getByRole('button', { name: '保存并继续' }).click()
    await onboarding.waitFor({ state: 'detached' })
    await connectFreshWorkspaceZh(page, scaffold.workspaceCwd)
    await fits(page.locator('[data-cloud-main]'), 'main')
    expect(Math.round((await page.locator('[data-cloud-main]').boundingBox())!.width)).toBe(390)
    await page.screenshot({ path: join(screenshots, 'chat-390.png') })
  })

  it('opens an overlay drawer without shrinking chat, then closes with Escape', async () => {
    await page.getByRole('button', { name: '展开侧栏', exact: true }).click()
    await page.locator('[data-cloud-drawer-open]').waitFor()
    await fits(page.locator('[data-cloud-sidebar]'), 'drawer')
    expect(Math.round((await page.locator('[data-cloud-main]').boundingBox())!.width)).toBe(390)
    await page.screenshot({ path: join(screenshots, 'drawer-390.png') })
    await page.keyboard.press('Escape')
    await page.locator('[data-cloud-drawer-open]').waitFor({ state: 'detached' })
  })

  it('keeps provider actions, model inputs and settings navigation inside small screens', async () => {
    await page.getByRole('button', { name: '展开侧栏', exact: true }).click()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置', exact: true })
    await dialog.getByRole('button', { name: '模型', exact: true }).click()
    await dialog.getByText('DeepSeek', { exact: true }).locator('xpath=ancestor::li').getByRole('button', { name: '编辑' }).click()
    await dialog.getByText('自定义设置', { exact: true }).click()
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 })
      await fits(dialog, 'model dialog')
      for (const label of ['API 密钥', 'API 地址', '模型 ID 1', '显示名称 1']) {
        const input = dialog.getByLabel(label, { exact: true })
        await input.scrollIntoViewIfNeeded()
        await fits(input, label)
        expect(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16)
      }
      await page.screenshot({ path: join(screenshots, `models-${width}.png`) })
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    await page.keyboard.press('Escape')
  })

  it('fits the mode selector and plugin manager in portrait and landscape', async () => {
    const mode = page.getByRole('button', { name: '标准模式', exact: true })
    await mode.click()
    await fits(page.getByRole('menu').last(), 'mode menu')
    await page.screenshot({ path: join(screenshots, 'mode-menu-390.png') })
    await page.getByRole('menuitem', { name: /^PTC 模式/u }).click()
    await page.getByRole('button', { name: 'PTC 模式', exact: true }).waitFor()
    await page.getByRole('button', { name: '展开侧栏', exact: true }).click()
    await page.getByRole('button', { name: '插件', exact: true }).click()
    await page.getByRole('heading', { name: '插件', exact: true }).waitFor()
    for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 667, height: 375 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(viewport)
      await fits(page.locator('[data-cloud-main]'), 'plugin page')
      await page.screenshot({ path: join(screenshots, `plugins-${viewport.width}.png`) })
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: 'dark' })
    await fits(page.locator('[data-cloud-main]'), 'dark plugin page')
    await page.screenshot({ path: join(screenshots, 'plugins-dark-390.png') })
    expect(errors).toEqual([])
  })

  it('signs out and requires login again', async () => {
    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    await page.getByRole('heading', { name: '登录 DeepSeek Harness', exact: true }).waitFor()
  })
})
