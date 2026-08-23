import { describe, expect, test, vi } from 'vitest'

const electron = vi.hoisted(() => {
  const browserWindowOptions: unknown[] = []
  const loadedUrls: string[] = []
  const partitionSession = {
    clearStorageData: vi.fn(),
    fetch: vi.fn(),
    flushStorageData: vi.fn(),
  }
  let currentUrl = ''
  const webContents = {
    executeJavaScript: vi.fn(),
    getURL: () => currentUrl,
    isDestroyed: () => false,
    loadURL: vi.fn(async (url: string) => {
      loadedUrls.push(url)
      currentUrl = url
    }),
    on: vi.fn(),
    setWindowOpenHandler: vi.fn(),
  }

  return { browserWindowOptions, loadedUrls, partitionSession, webContents }
})

vi.mock('electron', () => ({
  BrowserWindow: class {
    constructor(options: unknown) { electron.browserWindowOptions.push(options) }
    contentView = { addChildView: vi.fn() }
    isDestroyed() { return false }
    isVisible() { return false }
    show() {}
    hide() {}
    focus() {}
    close() {}
  },
  WebContentsView: class {
    webContents = electron.webContents
    setBounds() {}
    setBorderRadius() {}
  },
  session: { fromPartition: vi.fn(() => electron.partitionSession) },
}))

import { ElectronDouyinClient } from './electron-client.ts'

describe('ElectronDouyinClient login', () => {
  test('loads the first-party login page in a hidden window', async () => {
    const client = new ElectronDouyinClient(() => ({ isDestroyed: () => false }) as never)

    await client.refreshLogin()

    expect(electron.loadedUrls.at(-1)).toBe('https://www.douyin.com/login_page?service=https%3A%2F%2Fwww.douyin.com%2Flogin%3Ftype%3Dstormplatform_home')
    expect(electron.browserWindowOptions.at(-1)).toMatchObject({ show: false })
  })

  test('checks the persisted account outside a navigating page context', async () => {
    electron.webContents.executeJavaScript.mockRejectedValue(new Error('Execution context was destroyed'))
    electron.partitionSession.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        status_code: 0,
        user: { sec_uid: 'account-1', displayName: 'Sky' },
      }),
    })
    const client = new ElectronDouyinClient(() => ({ isDestroyed: () => false }) as never)

    await expect(client.getCurrentUser()).resolves.toMatchObject({ id: 'account-1', name: 'Sky' })
    expect(electron.partitionSession.fetch).toHaveBeenCalledOnce()
    expect(electron.webContents.executeJavaScript).not.toHaveBeenCalled()
  })
})
