import { BrowserWindow, session, WebContentsView } from 'electron'

import type { LoginSnapshot } from '../../../shared/platforms/contracts.js'
import type { TikTokClient } from './client.js'
import { detectTikTokLoginSurface } from './login-surface.js'
import {
  assertTikTokMutationSuccess,
  parseTikTokBrowserResponse,
  parseTikTokCurrentUser,
  parseTikTokFollowingPage,
  parseTikTokVideoPage,
} from './parsers.js'
import { isSafeTikTokQrCode, isTikTokUrl, registerTikTokNavigationGuards } from './policy.js'

const TIKTOK_ORIGIN = 'https://www.tiktok.com'
const TIKTOK_LOGIN_URL = 'https://www.tiktok.com/login/qrcode?lang=en'
const TIKTOK_PARTITION = 'persist:ebb-tiktok'
const COMMON_QUERY = { aid: '1988', app_language: 'en', app_name: 'tiktok_web' }

const LOGIN_SURFACE_SCRIPT = `(${detectTikTokLoginSurface.toString()})()`
const PAUSE_MEDIA_SCRIPT = `document.querySelectorAll('video, audio').forEach((media) => media.pause())`

export class ElectronTikTokClient implements TikTokClient {
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
    const view = await this.ensureWorkspaceLoaded()
    await this.loadOfficialPage(view, TIKTOK_LOGIN_URL)
  }

  async clearSession() {
    await session.fromPartition(TIKTOK_PARTITION).clearStorageData()
    if (this.workView && !this.workView.webContents.isDestroyed()) await this.loadOfficialPage(this.workView, TIKTOK_ORIGIN)
  }

  flushSession() {
    session.fromPartition(TIKTOK_PARTITION).flushStorageData()
  }

  async getCurrentUser() {
    await this.ensureWorkspaceLoaded()
    const payload = await this.requestFromSession('/passport/web/account/info/')
    return parseTikTokCurrentUser(payload)
  }

  async readLoginSurface(): Promise<LoginSnapshot> {
    const webContents = this.getWorkspaceView().webContents
    let verificationDetected = false
    for (const frame of webContents.mainFrame.framesInSubtree) {
      if (!isTikTokUrl(frame.url)) continue
      let result: unknown
      try {
        result = await frame.executeJavaScript(LOGIN_SURFACE_SCRIPT)
      } catch {
        // TikTok may replace login frames while composing the QR surface.
        continue
      }
      if (typeof result !== 'object' || result === null) continue
      const snapshot = result as LoginSnapshot
      if (snapshot.state === 'ready') {
        if (!isSafeTikTokQrCode(snapshot.qrCode)) throw new Error('TikTok returned an invalid QR code image.')
        return snapshot
      }
      if (snapshot.state === 'verification') verificationDetected = true
    }
    return verificationDetected ? { state: 'verification' } : { state: 'loading' }
  }

  async loadFavorites(userId: string, cursor: string, count: number) {
    const payload = await this.request('/api/favorite/item_list/', {
      ...COMMON_QUERY,
      count: String(count),
      cursor,
      secUid: userId,
    })
    return parseTikTokVideoPage(payload, cursor)
  }

  async loadCollections(userId: string, cursor: string, count: number) {
    const payload = await this.request('/api/user/collect/item_list/', {
      ...COMMON_QUERY,
      count: String(count),
      cursor,
      secUid: userId,
    })
    return parseTikTokVideoPage(payload, cursor)
  }

  async loadFollowing(userId: string, cursor: string, count: number) {
    const payload = await this.request('/api/user/list/', {
      ...COMMON_QUERY,
      count: String(count),
      cursor,
      scene: '21',
      secUid: userId,
    })
    return parseTikTokFollowingPage(payload, cursor)
  }

  async unlike(videoId: string) {
    const payload = await this.request('/api/commit/item/digg/', {
      ...COMMON_QUERY,
      aweme_id: videoId,
      type: '0',
    }, 'POST')
    assertTikTokMutationSuccess(payload)
  }

  async uncollect(videoId: string) {
    const payload = await this.request('/api/commit/item/collect/', {
      ...COMMON_QUERY,
      aweme_id: videoId,
      type: '0',
    }, 'POST')
    assertTikTokMutationSuccess(payload)
  }

  async unfollow(userId: string) {
    const payload = await this.request('/api/commit/follow/user/', {
      ...COMMON_QUERY,
      sec_user_id: userId,
      type: '0',
    }, 'POST')
    assertTikTokMutationSuccess(payload)
  }

  onWorkspaceCrash(callback: () => void) {
    this.crashCallbacks.add(callback)
    return () => this.crashCallbacks.delete(callback)
  }

  private async request(path: string, query: Record<string, string>, method: 'GET' | 'POST' = 'GET') {
    const url = new URL(path, TIKTOK_ORIGIN)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    const webContents = this.getWorkspaceView().webContents
    if (!isTikTokUrl(webContents.getURL())) throw new Error('Wait for the TikTok sign-in page to finish loading, then scan again.')

    const result: unknown = await webContents.executeJavaScript(`
      (async () => {
        const response = await fetch(${JSON.stringify(url.href)}, {
          credentials: 'include',
          headers: { Accept: 'application/json, text/plain, */*' },
          method: ${JSON.stringify(method)},
          signal: AbortSignal.timeout(10_000),
        })
        return { ok: response.ok, status: response.status, text: await response.text() }
      })()
    `)
    return parseTikTokBrowserResponse(result)
  }

  private async requestFromSession(path: string) {
    const response = await session.fromPartition(TIKTOK_PARTITION).fetch(new URL(path, TIKTOK_ORIGIN).href, {
      headers: { Accept: 'application/json, text/plain, */*' },
      signal: AbortSignal.timeout(10_000),
    })
    return parseTikTokBrowserResponse({
      ok: response.ok,
      status: response.status,
      text: await response.text(),
    })
  }

  private createWorkspaceView() {
    this.workspaceLoad = undefined
    const workspaceWindow = new BrowserWindow({
      parent: this.requireHostWindow(),
      show: false,
      width: 1280,
      height: 800,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    })
    const workView = new WebContentsView({
      webPreferences: {
        backgroundThrottling: true,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: TIKTOK_PARTITION,
      },
    })
    workView.setBounds({ x: 0, y: 0, width: 1280, height: 800 })
    workView.setBorderRadius(18)
    workspaceWindow.contentView.addChildView(workView)
    workView.webContents.setAudioMuted(true)
    registerTikTokNavigationGuards(workView.webContents)
    workView.webContents.on('media-started-playing', () => {
      // The hidden workspace needs TikTok's browser context, but never needs its media playback.
      void workView.webContents.executeJavaScript(PAUSE_MEDIA_SCRIPT).catch(() => {})
    })
    workView.webContents.on('render-process-gone', () => {
      for (const callback of this.crashCallbacks) callback()
    })
    this.workView = workView
    this.workspaceWindow = workspaceWindow
    return workView
  }

  private requireHostWindow() {
    const hostWindow = this.readHostWindow()
    if (!hostWindow || hostWindow.isDestroyed()) throw new Error('The Ebb window is not available.')
    return hostWindow
  }

  private getWorkspaceView() {
    if (!this.workView || this.workView.webContents.isDestroyed()) throw new Error('The TikTok sign-in page is not available.')
    return this.workView
  }

  private async ensureWorkspaceLoaded() {
    this.requireHostWindow()
    const view = this.workView && !this.workView.webContents.isDestroyed() ? this.workView : this.createWorkspaceView()
    if (this.workspaceLoad) {
      await this.workspaceLoad
      return view
    }
    if (!isTikTokUrl(view.webContents.getURL())) {
      const load = this.loadOfficialPage(view, TIKTOK_ORIGIN)
      this.workspaceLoad = load
      try {
        await load
      } finally {
        if (this.workspaceLoad === load) this.workspaceLoad = undefined
      }
    }
    return view
  }

  private async loadOfficialPage(view: WebContentsView, url: string) {
    try {
      await view.webContents.loadURL(url)
    } catch (error) {
      const navigationError = error as { code?: unknown; errno?: unknown }
      const wasReplaced = navigationError.code === 'ERR_ABORTED' || navigationError.errno === -3
      // TikTok replaces some first-party navigations while bootstrapping; the resulting page is still policy-bound.
      if (wasReplaced && isTikTokUrl(view.webContents.getURL())) return
      throw error
    }
  }
}
