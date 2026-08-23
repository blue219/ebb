import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

async function launchFixture(testOutput: string, scenario: 'success' | 'error' | 'following-success' | 'following-error') {
  const userData = join(testOutput, 'user-data')
  await mkdir(userData, { recursive: true })
  const electronApp = await electron.launch({
    args: ['dist-e2e/main.mjs'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      EBB_E2E_SCENARIO: scenario,
      EBB_E2E_USER_DATA: userData,
    },
  })
  const window = await electronApp.firstWindow()
  const runtimeErrors: string[] = []
  window.on('pageerror', (error) => runtimeErrors.push(error.message))
  window.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })
  return { electronApp, runtimeErrors, window }
}

async function expectIsolatedWindow(electronApp: ElectronApplication, page: Page) {
  await expect(page).toHaveTitle('Ebb')
  await expect(page.getByRole('heading', { name: 'Ebb' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Offline first video' })).toBeVisible()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(await page.evaluate(() => typeof window.ebb?.douyin?.getState)).toBe('function')
  expect(await page.evaluate(() => typeof window.ebb?.tiktok?.getState)).toBe('function')
  expect(await page.evaluate(() => typeof (window as Window & { process?: unknown }).process)).toBe('undefined')

  const preferences = await electronApp.evaluate(({ BrowserWindow }) => {
    const appWindow = BrowserWindow.getAllWindows()[0]
    if (!appWindow) return undefined
    return (appWindow.webContents as unknown as {
      getLastWebPreferences: () => { contextIsolation?: boolean; nodeIntegration?: boolean; sandbox?: boolean }
    }).getLastWebPreferences()
  })
  expect(preferences?.contextIsolation).toBe(true)
  expect(preferences?.nodeIntegration).toBe(false)
  expect(preferences?.sandbox).toBe(true)
}

test('switches to the offline TikTok workspace through the production preload bridge', async ({ browserName: _browserName }, testInfo) => {
  const { electronApp, runtimeErrors, window } = await launchFixture(testInfo.outputDir, 'success')
  try {
    await expectIsolatedWindow(electronApp, window)
    await window.getByRole('button', { name: 'TikTok' }).click()
    await expect(window.getByRole('checkbox', { name: 'Offline first video' })).toBeVisible()
    await expect(window.getByRole('group', { name: 'TikTok workspace' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'TikTok' })).toHaveAttribute('aria-pressed', 'true')

    const externalRequests = await electronApp.evaluate(() => (
      (globalThis as typeof globalThis & { getEbbExternalRequestCount: () => number }).getEbbExternalRequestCount()
    ))
    expect(externalRequests).toBe(0)
    expect(runtimeErrors).toEqual([])
  } finally {
    await electronApp.close()
  }
})

test('runs an offline manual removal through pause, continue, and completion', async ({ browserName: _browserName }, testInfo) => {
  const { electronApp, runtimeErrors, window } = await launchFixture(testInfo.outputDir, 'success')
  try {
    await expectIsolatedWindow(electronApp, window)
    await window.getByRole('checkbox', { name: 'Offline first video' }).click()
    await expect(window.getByRole('textbox', { name: 'Number of likes to clear' })).toHaveValue('Custom')
    await window.getByRole('button', { name: 'Clear 1 likes' }).click()
    await window.getByRole('button', { name: 'Clear likes' }).click()
    await window.getByRole('button', { name: 'Pause' }).click()
    await expect(window.getByRole('button', { name: 'Continue' })).toBeVisible()
    await window.getByRole('button', { name: 'Continue' }).click()
    await expect(window.getByRole('button').filter({ hasText: 'Reset' })).toBeVisible()
    await expect(window.getByText('Offline removal fixture completed.')).toBeVisible()

    const externalRequests = await electronApp.evaluate(() => (
      (globalThis as typeof globalThis & { getEbbExternalRequestCount: () => number }).getEbbExternalRequestCount()
    ))
    expect(externalRequests).toBe(0)
    expect(runtimeErrors).toEqual([])
  } finally {
    await electronApp.close()
  }
})

test('shows an injected mutation failure without contacting Douyin', async ({ browserName: _browserName }, testInfo) => {
  const { electronApp, runtimeErrors, window } = await launchFixture(testInfo.outputDir, 'error')
  try {
    await expectIsolatedWindow(electronApp, window)
    await window.getByRole('checkbox', { name: 'Offline first video' }).click()
    await window.getByRole('button', { name: 'Clear 1 likes' }).click()
    await window.getByRole('button', { name: 'Clear likes' }).click()
    await expect(window.getByText('Task paused')).toBeVisible()
    await expect(window.getByText('Douyin API request was rejected: offline fixture failure')).toBeVisible()

    const externalRequests = await electronApp.evaluate(() => (
      (globalThis as typeof globalThis & { getEbbExternalRequestCount: () => number }).getEbbExternalRequestCount()
    ))
    expect(externalRequests).toBe(0)
    expect(runtimeErrors).toEqual([])
  } finally {
    await electronApp.close()
  }
})

test('runs an offline manual unfollow through the production preload bridge', async ({ browserName: _browserName }, testInfo) => {
  const { electronApp, runtimeErrors, window } = await launchFixture(testInfo.outputDir, 'following-success')
  try {
    await expectIsolatedWindow(electronApp, window)
    await window.getByRole('button', { name: 'Following accounts' }).click()
    await expect(window.getByRole('button', { name: 'Following accounts', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(window.getByText('Offline first account')).toBeVisible()
    await window.getByRole('checkbox', { name: 'Offline first account' }).click()
    await window.getByRole('button', { name: 'Unfollow 1 accounts' }).click()
    await window.getByRole('button', { name: 'Unfollow accounts' }).click()
    await expect(window.getByText('Offline unfollow fixture completed.')).toBeVisible()
    await expect(window.getByRole('button').filter({ hasText: 'Reset' })).toBeVisible()

    const externalRequests = await electronApp.evaluate(() => (
      (globalThis as typeof globalThis & { getEbbExternalRequestCount: () => number }).getEbbExternalRequestCount()
    ))
    expect(externalRequests).toBe(0)
    expect(runtimeErrors).toEqual([])
  } finally {
    await electronApp.close()
  }
})

test('shows an injected unfollow failure without contacting Douyin', async ({ browserName: _browserName }, testInfo) => {
  const { electronApp, runtimeErrors, window } = await launchFixture(testInfo.outputDir, 'following-error')
  try {
    await expectIsolatedWindow(electronApp, window)
    await window.getByRole('button', { name: 'Following accounts' }).click()
    await window.getByRole('checkbox', { name: 'Offline first account' }).click()
    await window.getByRole('button', { name: 'Unfollow 1 accounts' }).click()
    await window.getByRole('button', { name: 'Unfollow accounts' }).click()
    await expect(window.getByText('Task paused')).toBeVisible()
    await expect(window.getByText('Douyin API request was rejected: offline unfollow fixture failure')).toBeVisible()

    const externalRequests = await electronApp.evaluate(() => (
      (globalThis as typeof globalThis & { getEbbExternalRequestCount: () => number }).getEbbExternalRequestCount()
    ))
    expect(externalRequests).toBe(0)
    expect(runtimeErrors).toEqual([])
  } finally {
    await electronApp.close()
  }
})

test('runs an offline manual uncollect through the production preload bridge', async ({ browserName: _browserName }, testInfo) => {
  const { electronApp, runtimeErrors, window } = await launchFixture(testInfo.outputDir, 'success')
  try {
    await expectIsolatedWindow(electronApp, window)
    await window.getByRole('button', { name: 'Collected videos' }).click()
    await expect(window.getByRole('checkbox', { name: 'Offline saved video' })).toBeVisible()
    await window.getByRole('checkbox', { name: 'Offline saved video' }).click()
    await window.getByRole('button', { name: 'Remove 1 collected videos' }).click()
    await window.getByRole('button', { name: 'Remove from collections' }).click()
    await expect(window.getByText('Offline collection fixture completed.')).toBeVisible()

    const externalRequests = await electronApp.evaluate(() => (
      (globalThis as typeof globalThis & { getEbbExternalRequestCount: () => number }).getEbbExternalRequestCount()
    ))
    expect(externalRequests).toBe(0)
    expect(runtimeErrors).toEqual([])
  } finally {
    await electronApp.close()
  }
})
