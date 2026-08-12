import { session, WebContentsView, type BrowserWindow } from 'electron'

import type { LoginSnapshot } from '../../../shared/platforms/douyin/contracts.js'
import type { DouyinClient } from './client.js'
import { detectDouyinLoginSurface } from './login-surface.js'
import {
  assertDouyinSuccess,
  parseBrowserResponse,
  parseCurrentUser,
  parseFavoritePage,
  parseLoginSurfaceResult,
} from './parsers.js'
import { isDouyinUrl, isSafeQrCodeDataUrl, registerDouyinNavigationGuards } from './policy.js'

const DOUYIN_ORIGIN = 'https://www.douyin.com'
const DOUYIN_API_ORIGIN = 'https://www-hj.douyin.com'
const DOUYIN_PARTITION = 'persist:ebb-douyin'

const LOGIN_SURFACE_SCRIPT = `(${detectDouyinLoginSurface.toString()})()`

export class ElectronDouyinClient implements DouyinClient {
  private workView?: WebContentsView
  private workspaceLoad?: Promise<void>
  private crashCallback = () => {}
  private readonly readHostWindow: () => BrowserWindow | undefined

  constructor(readHostWindow: () => BrowserWindow | undefined) {
    this.readHostWindow = readHostWindow
  }

  async initialize() {
    await this.ensureWorkspaceLoaded()
  }

  dispose() {
    if (this.workView && !this.workView.webContents.isDestroyed()) this.workView.webContents.close()
    this.workView = undefined
    this.workspaceLoad = undefined
  }

  async refreshLogin() {
    const workView = await this.ensureWorkspaceLoaded()
    await workView.webContents.loadURL(DOUYIN_ORIGIN)
  }

  async clearSession() {
    await session.fromPartition(DOUYIN_PARTITION).clearStorageData()
    if (this.workView && !this.workView.webContents.isDestroyed()) await this.workView.webContents.loadURL(DOUYIN_ORIGIN)
  }

  flushSession() {
    session.fromPartition(DOUYIN_PARTITION).flushStorageData()
  }

  async getCurrentUser() {
    const payload = await this.request('/aweme/v1/web/user/profile/self/', { aid: '6383' })
    return parseCurrentUser(payload)
  }

  async readLoginSurface(): Promise<LoginSnapshot> {
    const result: unknown = await this.getWorkspaceView().webContents.executeJavaScript(LOGIN_SURFACE_SCRIPT)
    const snapshot = parseLoginSurfaceResult(result)
    if (snapshot.state === 'ready' && !isSafeQrCodeDataUrl(snapshot.qrCode)) {
      throw new Error('Douyin returned an invalid QR code image.')
    }
    return snapshot
  }

  async loadFavorites(secUserId: string, cursor: string, count: number) {
    const payload = await this.request('/aweme/v1/web/aweme/favorite/', {
      aid: '6383',
      count: String(count),
      max_cursor: cursor,
      sec_user_id: secUserId,
    })
    return parseFavoritePage(payload, cursor)
  }

  async unlike(videoId: string) {
    const payload = await this.request('/aweme/v1/web/commit/item/digg/', {
      aid: '6383',
      aweme_id: videoId,
      type: '0',
    }, 'POST')
    assertDouyinSuccess(payload)
  }

  onWorkspaceCrash(callback: () => void) {
    this.crashCallback = callback
    return () => {
      if (this.crashCallback === callback) this.crashCallback = () => {}
    }
  }

  private createWorkspaceView() {
    this.workspaceLoad = undefined
    const workView = new WebContentsView({
      webPreferences: {
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: DOUYIN_PARTITION,
      },
    })
    // The detached view still needs a stable viewport for responsive sign-in controls.
    workView.setBounds({ x: 0, y: 0, width: 1280, height: 800 })
    workView.setBorderRadius(18)
    registerDouyinNavigationGuards(workView.webContents)
    workView.webContents.on('render-process-gone', () => this.crashCallback())
    this.workView = workView
    return workView
  }

  private async request(path: string, query: Record<string, string>, method: 'GET' | 'POST' = 'GET') {
    const url = new URL(path, DOUYIN_API_ORIGIN)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    const webContents = this.getWorkspaceView().webContents
    if (!isDouyinUrl(webContents.getURL())) {
      throw new Error('Wait for the Douyin sign-in page to finish loading, then scan again.')
    }

    const result: unknown = await webContents.executeJavaScript(`
      (async () => {
        const response = await fetch(${JSON.stringify(url.href)}, {
          credentials: 'include',
          headers: { Accept: 'application/json, text/plain, */*' },
          method: ${JSON.stringify(method)},
        })
        return { ok: response.ok, status: response.status, text: await response.text() }
      })()
    `)
    return parseBrowserResponse(result)
  }

  private requireHostWindow() {
    const hostWindow = this.readHostWindow()
    if (!hostWindow || hostWindow.isDestroyed()) throw new Error('The Ebb window is not available.')
    return hostWindow
  }

  private getWorkspaceView() {
    if (!this.workView || this.workView.webContents.isDestroyed()) {
      throw new Error('The Douyin sign-in page is not available.')
    }
    return this.workView
  }

  private async ensureWorkspaceLoaded() {
    this.requireHostWindow()
    const workView = this.workView && !this.workView.webContents.isDestroyed()
      ? this.workView
      : this.createWorkspaceView()
    if (this.workspaceLoad) {
      await this.workspaceLoad
      return workView
    }
    if (!isDouyinUrl(workView.webContents.getURL())) {
      const workspaceLoad = workView.webContents.loadURL(DOUYIN_ORIGIN).then(() => undefined)
      this.workspaceLoad = workspaceLoad
      try {
        await workspaceLoad
      } finally {
        if (this.workspaceLoad === workspaceLoad) this.workspaceLoad = undefined
      }
    }
    return workView
  }
}
