import { beforeEach, describe, expect, test, vi } from 'vitest'
import { JSDOM } from 'jsdom'

const electron = vi.hoisted(() => {
  const browserWindowOptions: unknown[] = []
  const webContentsViewOptions: unknown[] = []
  const loadedUrls: string[] = []
  const partitions: string[] = []
  const frames: Array<{ url: string; executeJavaScript: ReturnType<typeof vi.fn> }> = []
  const listeners = new Map<string, () => void>()
  const sessionFetch = vi.fn()
  const location = { currentUrl: '' }
  const webContents = {
    executeJavaScript: vi.fn(),
    getURL: () => location.currentUrl,
    isDestroyed: () => false,
    loadURL: vi.fn(async (url: string) => { loadedUrls.push(url); location.currentUrl = url }),
    mainFrame: { framesInSubtree: frames },
    on: vi.fn((event: string, callback: () => void) => { listeners.set(event, callback) }),
    setAudioMuted: vi.fn(),
    setWindowOpenHandler: vi.fn(),
  }
  return { browserWindowOptions, frames, listeners, loadedUrls, location, partitions, sessionFetch, webContents, webContentsViewOptions }
})

vi.mock('electron', () => ({
  BrowserWindow: class {
    constructor(options: unknown) { electron.browserWindowOptions.push(options) }
    contentView = { addChildView: vi.fn() }
    isDestroyed() { return false }
    close() {}
    focus = vi.fn()
    hide = vi.fn()
    setIgnoreMouseEvents = vi.fn()
    show = vi.fn()
    showInactive = vi.fn()
  },
  WebContentsView: class {
    constructor(options: unknown) { electron.webContentsViewOptions.push(options) }
    webContents = electron.webContents
    setBounds() {}
    setBorderRadius() {}
  },
  session: {
    fromPartition: vi.fn((partition: string) => {
      electron.partitions.push(partition)
      return { clearStorageData: vi.fn(), fetch: electron.sessionFetch, flushStorageData: vi.fn() }
    }),
  },
}))

import { ElectronTikTokClient, readTikTokFollowingModalSnapshot } from './electron-client.ts'

beforeEach(() => {
  electron.browserWindowOptions.length = 0
  electron.frames.length = 0
  electron.listeners.clear()
  electron.loadedUrls.length = 0
  electron.location.currentUrl = ''
  electron.partitions.length = 0
  electron.sessionFetch.mockReset()
  electron.webContents.executeJavaScript.mockReset().mockResolvedValue(undefined)
  electron.webContents.loadURL.mockReset().mockImplementation(async (url: string) => {
    electron.loadedUrls.push(url)
    electron.location.currentUrl = url
  })
  electron.webContentsViewOptions.length = 0
  electron.webContents.setAudioMuted.mockReset()
})

describe('ElectronTikTokClient workspace', () => {
  test('uses the dedicated first-party QR page in an independent active partition', async () => {
    const client = new ElectronTikTokClient(() => ({ isDestroyed: () => false }) as never)

    await client.refreshLogin()

    expect(electron.loadedUrls.at(-1)).toBe('https://www.tiktok.com/login/qrcode?lang=en')
    expect(electron.browserWindowOptions.at(-1)).toMatchObject({
      show: false,
      skipTaskbar: true,
    })
    expect(electron.webContentsViewOptions.at(-1)).toMatchObject({
      webPreferences: { partition: 'persist:ebb-tiktok' },
    })
  })

  test('mutes, throttles, and pauses media in the background TikTok workspace', async () => {
    const client = new ElectronTikTokClient(() => ({ isDestroyed: () => false }) as never)

    await client.initialize()

    expect(electron.webContents.setAudioMuted).toHaveBeenCalledWith(true)
    expect(electron.webContentsViewOptions.at(-1)).toMatchObject({
      webPreferences: { backgroundThrottling: true },
    })

    electron.listeners.get('media-started-playing')?.()
    await vi.waitFor(() => expect(electron.webContents.executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('media.pause()'),
    ))
  })

  test('rejects an untrusted QR payload instead of hiding the contract failure', async () => {
    const client = new ElectronTikTokClient(() => ({ isDestroyed: () => false }) as never)
    electron.frames.push({
      url: 'https://www.tiktok.com/login/qrcode',
      executeJavaScript: vi.fn(async () => ({ state: 'ready', qrCode: 'https://attacker.invalid/qr.svg' })),
    })

    await client.initialize()
    await expect(client.readLoginSurface()).rejects.toThrow('invalid QR code image')
    electron.frames.length = 0
  })

  test('continues to the QR page when TikTok replaces an official initialization navigation', async () => {
    const client = new ElectronTikTokClient(() => ({ isDestroyed: () => false }) as never)
    electron.webContents.loadURL.mockImplementationOnce(async (url: string) => {
      electron.loadedUrls.push(url)
      electron.location.currentUrl = url
      throw Object.assign(new Error('ERR_ABORTED (-3) loading https://www.tiktok.com/'), {
        code: 'ERR_ABORTED',
        errno: -3,
      })
    })

    await expect(client.refreshLogin()).resolves.toBeUndefined()
    expect(electron.loadedUrls.slice(-2)).toEqual([
      'https://www.tiktok.com',
      'https://www.tiktok.com/login/qrcode?lang=en',
    ])
  })

  test('reads the signed-in account from the persistent session when the login page has no account hydration', async () => {
    const client = new ElectronTikTokClient(() => ({ isDestroyed: () => false }) as never)
    electron.sessionFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: {
          user_id_str: 'account-1',
          screen_name: 'Signed-in account',
          username: 'signed-in-account',
          avatar_url: 'https://example.invalid/avatar.webp',
        },
        message: 'success',
      }),
    })

    await expect(client.getCurrentUser()).resolves.toEqual({
      id: 'account-1',
      name: 'Signed-in account',
      avatar: 'https://example.invalid/avatar.webp',
    })
    expect(electron.sessionFetch).toHaveBeenCalledWith(
      expect.stringContaining('/passport/web/account/info/'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  test('scopes collected-video reads to the signed-in secured user ID', async () => {
    const client = new ElectronTikTokClient(() => ({ isDestroyed: () => false }) as never)
    electron.webContents.executeJavaScript.mockResolvedValue({
      ok: true,
      status: 200,
      text: JSON.stringify({ statusCode: 0, itemList: [], hasMore: false }),
    })
    electron.webContents.executeJavaScript.mockResolvedValueOnce(true)

    await client.initialize()
    await client.loadCollections('secured-user-1', '0', 30)

    expect(electron.webContents.executeJavaScript).toHaveBeenLastCalledWith(
      expect.stringContaining('secUid=secured-user-1'),
    )
    expect(electron.webContents.executeJavaScript).toHaveBeenLastCalledWith(
      expect.stringContaining('AbortSignal.timeout(10_000)'),
    )
  })

  test('uses TikTok page controls to remove a loaded like', async () => {
    const client = new ElectronTikTokClient(() => ({ isDestroyed: () => false }) as never)
    electron.webContents.executeJavaScript
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: JSON.stringify({
          statusCode: 0,
          itemList: [{ id: 'video-1', author: { uniqueId: 'creator-1' } }],
          hasMore: false,
        }),
      })
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('true')
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('false')

    await client.initialize()
    await client.loadFavorites('secured-user-1', '0', 30)
    await client.unlike('video-1')

    expect(electron.loadedUrls.at(-1)).toBe('https://www.tiktok.com/foryou?lang=en')
    expect(electron.webContents.executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('?.click()'),
    )
  })

  test('uses TikTok page controls to remove a loaded favorite', async () => {
    const client = new ElectronTikTokClient(() => ({ isDestroyed: () => false }) as never)
    electron.webContents.executeJavaScript
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: JSON.stringify({
          statusCode: 0,
          itemList: [{ id: 'video-1', author: { uniqueId: 'creator-1' } }],
          hasMore: false,
        }),
      })
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('remove')
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('add')

    await client.initialize()
    await client.loadCollections('secured-user-1', '0', 30)
    await client.uncollect('video-1')

    expect(electron.webContents.executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('[data-e2e=\\\"favorite-icon\\\"]'),
    )
  })

  test('loads following accounts through the signed-in profile dialog', async () => {
    const client = new ElectronTikTokClient(() => ({ isDestroyed: () => false }) as never)
    electron.sessionFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: { user_id_str: 'account-1', screen_name: 'Signed in', username: 'signed-in' },
        message: 'success',
      }),
    })
    electron.webContents.executeJavaScript
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        accounts: [{
          id: 'creator-1',
          displayName: 'Creator',
          username: 'creator-1',
          relation: 'following',
          status: 'pending',
        }],
        isOpen: true,
        total: 1,
      })

    await client.getCurrentUser()
    await expect(client.loadFollowing('account-1', '0', 30)).resolves.toEqual({
      accounts: [{
        id: 'creator-1',
        displayName: 'Creator',
        username: 'creator-1',
        relation: 'following',
        status: 'pending',
      }],
      nextCursor: undefined,
      hasMore: false,
      total: 1,
    })
    expect(electron.loadedUrls.at(-1)).toBe('https://www.tiktok.com/foryou?lang=en')
  })

  test('uses the scanned profile identity and confirms the unfollowed state', async () => {
    const client = new ElectronTikTokClient(() => ({ isDestroyed: () => false }) as never)
    electron.sessionFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: { user_id_str: 'account-1', screen_name: 'Signed in', username: 'signed-in' },
        message: 'success',
      }),
    })
    electron.webContents.executeJavaScript
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        accounts: [{
          id: 'creator-1',
          displayName: 'Creator',
          username: 'creator-1',
          relation: 'following',
          status: 'pending',
        }],
        isOpen: true,
        total: 1,
      })

    await client.getCurrentUser()
    await client.loadFollowing('account-1', '0', 30)

    electron.webContents.executeJavaScript.mockReset()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ state: 'Following' })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(true)

    await client.unfollow('creator-1')

    expect(electron.webContents.executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('/@creator-1?lang=en'),
    )
    expect(electron.webContents.executeJavaScript).toHaveBeenLastCalledWith(
      expect.stringContaining("button.innerText.trim() === 'Follow'"),
    )
  })
})

test('reads account identity and relation from the TikTok following dialog', () => {
  const previousDocument = globalThis.document
  const dom = new JSDOM(`
    <section role="dialog">
      <button role="tab">Following 1</button>
      <div>
        <a href="https://www.tiktok.com/@creator-1"><img src="https://example.invalid/avatar.webp"></a>
        <span>Creator One</span>
        <span>creator-1</span>
        <button>Friends</button>
      </div>
    </section>
  `)
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document })
  try {
    expect(readTikTokFollowingModalSnapshot()).toEqual({
      accounts: [{
        id: 'creator-1',
        displayName: 'Creator One',
        username: 'creator-1',
        avatar: 'https://example.invalid/avatar.webp',
        relation: 'mutual',
        status: 'pending',
      }],
      isOpen: true,
      total: 1,
    })
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument })
  }
})

test('recognizes an empty TikTok following dialog', () => {
  const previousDocument = globalThis.document
  const dom = new JSDOM(`
    <section role="dialog">
      <button role="tab">Following 0</button>
      <p>No accounts yet</p>
    </section>
  `)
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document })
  try {
    expect(readTikTokFollowingModalSnapshot()).toEqual({
      accounts: [],
      isOpen: true,
      total: 0,
    })
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument })
  }
})
