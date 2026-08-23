import { BrowserWindow, session, WebContentsView } from 'electron'

import type { LoginSnapshot } from '../../../shared/platforms/douyin/contracts.js'
import type { DouyinClient } from './client.js'
import { detectDouyinLoginSurface } from './login-surface.js'
import {
  assertDouyinSuccess,
  assertDouyinMutationSuccess,
  parseBrowserResponse,
  parseCurrentUser,
  parseFavoritePage,
  parseFollowingPage,
  parseLoginSurfaceResult,
} from './parsers.js'
import { isDouyinUrl, isSafeQrCodeDataUrl, registerDouyinNavigationGuards } from './policy.js'

const DOUYIN_ORIGIN = 'https://www.douyin.com'
const DOUYIN_API_ORIGIN = 'https://www-hj.douyin.com'
const DOUYIN_LOGIN_URL = 'https://www.douyin.com/login_page?service=https%3A%2F%2Fwww.douyin.com%2Flogin%3Ftype%3Dstormplatform_home'
const DOUYIN_PARTITION = 'persist:ebb-douyin'

const LOGIN_SURFACE_SCRIPT = `(${detectDouyinLoginSurface.toString()})()`

export class ElectronDouyinClient implements DouyinClient {
  private workView?: WebContentsView
  private workspaceWindow?: BrowserWindow
  private workspaceLoad?: Promise<void>
  private readonly crashCallbacks = new Set<() => void>()
  private readonly readHostWindow: () => BrowserWindow | undefined

  constructor(readHostWindow: () => BrowserWindow | undefined) {
    this.readHostWindow = readHostWindow
  }

  async initialize() {
    await this.ensureWorkspaceLoaded()
  }

  dispose() {
    if (this.workspaceWindow && !this.workspaceWindow.isDestroyed()) this.workspaceWindow.close()
    else if (this.workView && !this.workView.webContents.isDestroyed()) this.workView.webContents.close()
    this.workView = undefined
    this.workspaceWindow = undefined
    this.workspaceLoad = undefined
  }

  async refreshLogin() {
    const workView = await this.ensureWorkspaceLoaded()
    await workView.webContents.loadURL(DOUYIN_LOGIN_URL)
  }

  async clearSession() {
    await session.fromPartition(DOUYIN_PARTITION).clearStorageData()
    if (this.workView && !this.workView.webContents.isDestroyed()) await this.workView.webContents.loadURL(DOUYIN_ORIGIN)
  }

  flushSession() {
    session.fromPartition(DOUYIN_PARTITION).flushStorageData()
  }

  async getCurrentUser() {
    const payload = await this.requestFromSession('/aweme/v1/web/user/profile/self/', { aid: '6383' })
    return parseCurrentUser(payload)
  }

  async readLoginSurface(): Promise<LoginSnapshot> {
    const webContents = this.getWorkspaceView().webContents
    let verificationDetected = false
    for (const frame of webContents.mainFrame.framesInSubtree) {
      if (!isDouyinUrl(frame.url)) continue
      try {
        const result: unknown = await frame.executeJavaScript(LOGIN_SURFACE_SCRIPT)
        const snapshot = parseLoginSurfaceResult(result)
        if (snapshot.state === 'ready') {
          if (!isSafeQrCodeDataUrl(snapshot.qrCode)) throw new Error('Douyin returned an invalid QR code image.')
          return snapshot
        }
        if (snapshot.state === 'verification') verificationDetected = true
      } catch {
        // Frames may navigate while the sign-in UI is being composed; poll again shortly.
      }
    }
    return verificationDetected ? { state: 'verification' } : { state: 'loading' }
  }

  async loadFavorites(id: string, cursor: string, count: number) {
    const payload = await this.request('/aweme/v1/web/aweme/favorite/', {
      aid: '6383',
      count: String(count),
      max_cursor: cursor,
      sec_user_id: id,
    })
    return parseFavoritePage(payload, cursor)
  }

  async loadFollowing(id: string, cursor: string, count: number) {
    let activeCursor = cursor
    if (cursor === '0') {
      const primer = await this.request('/aweme/v1/web/user/following/list/', {
        aid: '6383',
        count: String(count),
        max_time: '0',
        sec_user_id: id,
        source_type: '2',
      }, 'GET', DOUYIN_ORIGIN)
      const primed = parseFollowingPage(primer, cursor)
      activeCursor = primed.nextCursor ?? cursor
    }

    const payload = await this.request('/aweme/v1/web/user/following/list/', {
      aid: '6383',
      count: String(count),
      max_time: activeCursor,
      sec_user_id: id,
      source_type: '1',
    }, 'GET', DOUYIN_ORIGIN)
    return parseFollowingPage(payload, activeCursor)
  }

  async unlike(videoId: string) {
    const payload = await this.request('/aweme/v1/web/commit/item/digg/', {
      aid: '6383',
      aweme_id: videoId,
      type: '0',
    }, 'POST')
    assertDouyinSuccess(payload)
  }

  async loadCollections(_id: string, cursor: string, count: number) {
    const payload = await this.request('/aweme/v1/web/aweme/listcollection/', {
      aid: '6383',
    }, 'POST', DOUYIN_ORIGIN, {
      count: String(count),
      cursor,
    })
    return parseFavoritePage(payload, cursor)
  }

  async uncollect(videoId: string) {
    const payload = await this.request('/aweme/v1/web/commit/item/collect/', {
      aid: '6383',
      aweme_id: videoId,
      type: '0',
    }, 'POST')
    assertDouyinSuccess(payload)
  }

  async unfollow(id: string) {
    const payload = await this.request('/aweme/v1/web/commit/follow/user/', {
      aid: '6383',
      sec_user_id: id,
      type: '0',
    }, 'POST')
    assertDouyinMutationSuccess(payload)
  }

  onWorkspaceCrash(callback: () => void) {
    this.crashCallbacks.add(callback)
    return () => this.crashCallbacks.delete(callback)
  }

  private createWorkspaceView() {
    this.workspaceLoad = undefined
    const workspaceWindow = new BrowserWindow({
      parent: this.requireHostWindow(),
      show: false,
      width: 1280,
      height: 800,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    const workView = new WebContentsView({
      webPreferences: {
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: DOUYIN_PARTITION,
      },
    })
    // This invisible host gives Douyin's responsive login page a real viewport.
    workView.setBounds({ x: 0, y: 0, width: 1280, height: 800 })
    workView.setBorderRadius(18)
    workspaceWindow.contentView.addChildView(workView)
    registerDouyinNavigationGuards(workView.webContents)
    workView.webContents.on('render-process-gone', () => {
      for (const callback of this.crashCallbacks) callback()
    })
    this.workView = workView
    this.workspaceWindow = workspaceWindow
    return workView
  }

  private async request(
    path: string,
    query: Record<string, string>,
    method: 'GET' | 'POST' = 'GET',
    origin = DOUYIN_API_ORIGIN,
    body?: Record<string, string>,
  ) {
    const url = new URL(path, origin)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    const requestBody = body ? new URLSearchParams(body).toString() : undefined
    const webContents = this.getWorkspaceView().webContents
    if (!isDouyinUrl(webContents.getURL())) {
      throw new Error('Wait for the Douyin sign-in page to finish loading, then scan again.')
    }

    const result: unknown = await webContents.executeJavaScript(`
      (async () => {
        const response = await fetch(${JSON.stringify(url.href)}, {
          credentials: 'include',
          headers: {
            Accept: 'application/json, text/plain, */*',
            ...(requestBody ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          },
          method: ${JSON.stringify(method)},
          ...(requestBody ? { body: ${JSON.stringify(requestBody)} } : {}),
        })
        return { ok: response.ok, status: response.status, text: await response.text() }
      })()
    `)
    return parseBrowserResponse(result)
  }

  private async requestFromSession(path: string, query: Record<string, string>) {
    const url = new URL(path, DOUYIN_API_ORIGIN)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    const response = await session.fromPartition(DOUYIN_PARTITION).fetch(url.href, {
      headers: { Accept: 'application/json, text/plain, */*' },
      signal: AbortSignal.timeout(10_000),
    })
    return parseBrowserResponse({
      ok: response.ok,
      status: response.status,
      text: await response.text(),
    })
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
