import { BrowserWindow, session, WebContentsView } from 'electron'

import type { FollowingAccount, LoginSnapshot } from '../../../shared/platforms/contracts.js'
import type { TikTokClient } from './client.js'
import { detectTikTokLoginSurface } from './login-surface.js'
import {
  isObject,
  parseTikTokBrowserResponse,
  parseTikTokCurrentUser,
  parseTikTokVideoPage,
} from './parsers.js'
import { isSafeTikTokQrCode, isTikTokUrl, registerTikTokNavigationGuards } from './policy.js'

const TIKTOK_ORIGIN = 'https://www.tiktok.com'
const TIKTOK_LOGIN_URL = 'https://www.tiktok.com/login/qrcode?lang=en'
const TIKTOK_PARTITION = 'persist:ebb-tiktok'
const COMMON_QUERY = { aid: '1988', app_language: 'en', app_name: 'tiktok_web' }

const LOGIN_SURFACE_SCRIPT = `(${detectTikTokLoginSurface.toString()})()`
const PAUSE_MEDIA_SCRIPT = `document.querySelectorAll('video, audio').forEach((media) => media.pause())`

type FollowingModalSnapshot = {
  accounts: FollowingAccount[]
  isOpen: boolean
  total?: number
}

// Keep the DOM knowledge local to the TikTok adapter; callers still use the shared platform interface.
export function readTikTokFollowingModalSnapshot(): FollowingModalSnapshot {
  const textOf = (element: HTMLElement) => (element.innerText || element.textContent || '').trim()
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
  const hasFollowingTab = (candidate: HTMLElement) => [...candidate.querySelectorAll<HTMLElement>('[role="tab"], button')]
    .some((element) => /^Following(?:\s+\d+)?$/.test(textOf(element)))
  const dialog = dialogs.find(hasFollowingTab)
    ?? dialogs.find((candidate) => candidate.querySelector('a[href*="/@"]'))
  if (!dialog) return { accounts: [], isOpen: false }

  const accounts = new Map<string, FollowingAccount>()
  for (const anchor of dialog.querySelectorAll<HTMLAnchorElement>('a[href*="/@"]')) {
    let username: string | undefined
    try {
      const match = new URL(anchor.href).pathname.match(/^\/@([^/]+)/)
      if (match) username = decodeURIComponent(match[1])
    } catch {
      continue
    }
    if (!username || accounts.has(username)) continue

    let row: HTMLElement | null = anchor
    let relationButton: HTMLButtonElement | undefined
    while (row && row !== dialog) {
      relationButton = [...row.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => ['Following', 'Friends'].includes(textOf(button)))
      if (relationButton) break
      row = row.parentElement
    }
    if (!row || !relationButton) continue

    const lines = (row.innerText || row.textContent || '').split('\n').map((line) => line.trim()).filter(Boolean)
    const displayName = lines.find((line) => ![
      username,
      `@${username}`,
      'Following',
      'Friends',
    ].includes(line)) ?? username
    // The dialog exposes no secured user ID; this scan-scoped ID is discarded on every refresh.
    accounts.set(username, {
      id: username,
      displayName,
      username,
      avatar: row.querySelector<HTMLImageElement>('img')?.src,
      relation: textOf(relationButton) === 'Friends' ? 'mutual' : 'following',
      status: 'pending',
    })
  }

  const selectedTab = [...dialog.querySelectorAll<HTMLElement>('[role="tab"], button')]
    .find((candidate) => /^Following(?:\s+\d+)?$/.test(textOf(candidate)))
  const totalMatch = selectedTab && textOf(selectedTab).match(/(\d[\d,]*)/)
  return {
    accounts: [...accounts.values()],
    isOpen: true,
    total: totalMatch ? Number(totalMatch[1].replaceAll(',', '')) : undefined,
  }
}

const FOLLOWING_MODAL_SNAPSHOT_SCRIPT = `(${readTikTokFollowingModalSnapshot.toString()})()`

const readPayloadString = (payload: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

export class ElectronTikTokClient implements TikTokClient {
  private workView?: WebContentsView
  private workspaceWindow?: BrowserWindow
  private workspaceLoad?: Promise<void>
  private readonly crashCallbacks = new Set<() => void>()
  private readonly readHostWindow: () => BrowserWindow | undefined
  private readonly videoAuthors = new Map<string, string>()
  private followingAccounts: FollowingAccount[] = []
  private followingExhausted = false
  private followingTotal?: number
  private currentUsername?: string

  constructor(readHostWindow: () => BrowserWindow | undefined) {
    this.readHostWindow = readHostWindow
  }

  async initialize() {
    try {
      await this.ensureWorkspaceLoaded()
    } finally {
      this.restoreHostFocus()
    }
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
    try {
      await this.loadOfficialPage(view, TIKTOK_LOGIN_URL)
    } finally {
      this.restoreHostFocus()
    }
  }

  async clearSession() {
    await session.fromPartition(TIKTOK_PARTITION).clearStorageData()
    this.currentUsername = undefined
    this.followingAccounts = []
    this.followingExhausted = false
    this.followingTotal = undefined
    this.videoAuthors.clear()
    if (this.workView && !this.workView.webContents.isDestroyed()) {
      try {
        await this.loadOfficialPage(this.workView, TIKTOK_ORIGIN)
      } finally {
        this.restoreHostFocus()
      }
    }
  }

  flushSession() {
    session.fromPartition(TIKTOK_PARTITION).flushStorageData()
  }

  async getCurrentUser() {
    await this.ensureWorkspaceLoaded()
    const payload = await this.requestFromSession('/passport/web/account/info/')
    this.rememberCurrentUsername(payload)
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
    this.rememberVideoAuthors(payload)
    return parseTikTokVideoPage(payload, cursor)
  }

  async loadCollections(userId: string, cursor: string, count: number) {
    const payload = await this.request('/api/user/collect/item_list/', {
      ...COMMON_QUERY,
      count: String(count),
      cursor,
      secUid: userId,
    })
    this.rememberVideoAuthors(payload)
    return parseTikTokVideoPage(payload, cursor)
  }

  async loadFollowing(_userId: string, cursor: string, count: number) {
    const offset = Number(cursor)
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('TikTok returned an invalid following cursor.')
    try {
      if (offset === 0) await this.openFollowingModal()

      let stagnantAttempts = 0
      while (this.followingAccounts.length < offset + count && !this.followingExhausted) {
        const previousCount = this.followingAccounts.length
        await this.scrollFollowingModal()
        if (this.followingAccounts.length === previousCount) stagnantAttempts += 1
        else stagnantAttempts = 0
        if (stagnantAttempts >= 2) this.followingExhausted = true
      }

      const accounts = this.followingAccounts.slice(offset, offset + count)
      const nextOffset = offset + accounts.length
      const totalReached = this.followingTotal !== undefined && nextOffset >= this.followingTotal
      const hasMore = nextOffset < this.followingAccounts.length || (!this.followingExhausted && !totalReached)
      return {
        accounts,
        nextCursor: hasMore ? String(nextOffset) : undefined,
        hasMore,
        total: this.followingTotal,
      }
    } finally {
      this.restoreHostFocus()
    }
  }

  async unlike(videoId: string) {
    await this.toggleVideoState(videoId, 'like')
  }

  async uncollect(videoId: string) {
    await this.toggleVideoState(videoId, 'favorite')
  }

  async unfollow(userId: string) {
    try {
      const username = this.followingAccounts.find((account) => account.id === userId)?.username ?? userId
      const view = await this.openSignedInWorkspace()
      // Let TikTok create its signed request, then require the profile control to reach Follow.
      await view.webContents.executeJavaScript(`location.href = ${JSON.stringify(`${TIKTOK_ORIGIN}/@${encodeURIComponent(username)}?lang=en`)}`)
      const state = await this.waitForWorkspaceValue<{ state?: string }>(`(() => {
        const buttons = [...document.querySelectorAll('button')]
        const action = buttons.find((button) => ['Follow', 'Following', 'Friends'].includes(button.innerText.trim()) && button.getAttribute('aria-label') !== button.innerText.trim())
        return { state: action?.innerText.trim() }
      })()`, (value) => Boolean(value.state), 'TikTok did not expose the following control for this account.')
      if (state.state === 'Follow') return

      await view.webContents.executeJavaScript(`(() => {
        const buttons = [...document.querySelectorAll('button')]
        const action = buttons.find((button) => ['Following', 'Friends'].includes(button.innerText.trim()) && button.getAttribute('aria-label') !== button.innerText.trim())
        action?.click()
      })()`)
      if (state.state === 'Friends') {
        const menuReady = await this.waitForWorkspaceValue<boolean>(`[...document.querySelectorAll('button, [role="menuitem"]')].some((item) => item.textContent?.trim() === 'Unfollow')`, Boolean, 'TikTok did not expose the unfollow action.')
        if (menuReady) await view.webContents.executeJavaScript(`[...document.querySelectorAll('button, [role="menuitem"]')].find((item) => item.textContent?.trim() === 'Unfollow')?.click()`)
      }
      await this.waitForWorkspaceValue<boolean>(`[...document.querySelectorAll('button')].some((button) => button.innerText.trim() === 'Follow' && button.getAttribute('aria-label') !== 'Follow')`, Boolean, 'TikTok did not confirm the unfollow action.')
    } finally {
      this.restoreHostFocus()
    }
  }

  onWorkspaceCrash(callback: () => void) {
    this.crashCallbacks.add(callback)
    return () => this.crashCallbacks.delete(callback)
  }

  private async request(path: string, query: Record<string, string>) {
    const url = new URL(path, TIKTOK_ORIGIN)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    const view = this.getWorkspaceView()
    const webContents = view.webContents
    if (!isTikTokUrl(webContents.getURL())) throw new Error('Wait for the TikTok sign-in page to finish loading, then scan again.')

    this.activateWorkspace()
    try {
      const pageReady = await webContents.executeJavaScript(`Boolean(document.body?.innerText.trim() && document.querySelector('button[aria-label="Profile"]'))`) as boolean
      if (!pageReady) {
        await this.loadOfficialPage(view, `${TIKTOK_ORIGIN}/foryou?lang=en`)
        await this.waitForWorkspaceValue<boolean>(`Boolean(document.body?.innerText.trim() && document.querySelector('button[aria-label="Profile"]'))`, Boolean, 'TikTok did not load its signed-in page.')
      }
      const result: unknown = await webContents.executeJavaScript(`
        (async () => {
          const response = await fetch(${JSON.stringify(url.href)}, {
            credentials: 'include',
            headers: { Accept: 'application/json, text/plain, */*' },
            signal: AbortSignal.timeout(10_000),
          })
          return { ok: response.ok, status: response.status, text: await response.text() }
        })()
      `)
      return parseTikTokBrowserResponse(result)
    } finally {
      this.restoreHostFocus()
    }
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
      show: false,
      skipTaskbar: true,
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
      // The background workspace needs TikTok's browser context, but never needs its media playback.
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
    this.activateWorkspace()
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

  private rememberCurrentUsername(payload: Record<string, unknown>) {
    const data = isObject(payload.data) ? payload.data : undefined
    const userInfo = isObject(payload.userInfo) ? payload.userInfo : isObject(data?.userInfo) ? data.userInfo : undefined
    const candidates = [data, isObject(userInfo?.user) ? userInfo.user : undefined, isObject(payload.user) ? payload.user : undefined]
      .filter(isObject)
    for (const candidate of candidates) {
      const username = readPayloadString(candidate, 'username', 'uniqueId', 'unique_id')
      if (username) {
        this.currentUsername = username
        return
      }
    }
  }

  private rememberVideoAuthors(payload: Record<string, unknown>) {
    const rawRecords = payload.itemList ?? payload.item_list ?? payload.aweme_list ?? payload.items
    if (!Array.isArray(rawRecords)) return
    for (const rawRecord of rawRecords) {
      if (!isObject(rawRecord)) continue
      const id = readPayloadString(rawRecord, 'id', 'aweme_id', 'itemId', 'item_id')
      const author = isObject(rawRecord.author) ? rawRecord.author : undefined
      const username = author && readPayloadString(author, 'uniqueId', 'unique_id', 'username')
      if (id && username) this.videoAuthors.set(id, username)
    }
  }

  private async openFollowingModal() {
    if (!this.currentUsername) throw new Error('TikTok did not expose the signed-in username. Sign in again and retry.')
    this.followingAccounts = []
    this.followingExhausted = false
    this.followingTotal = undefined
    const view = await this.openSignedInWorkspace()
    // TikTok's unsigned list endpoint returns no rows, while its first-party dialog exposes the account's list.
    await view.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Profile')?.click()`)
    await this.waitForWorkspaceValue<boolean>(`(() => {
      const count = document.querySelector('[data-e2e="following-count"]')?.textContent?.trim()
      return Boolean(document.querySelector('[data-e2e="following"]') && count && count !== '-')
    })()`, Boolean, 'TikTok did not load the signed-in profile following count.')
    await view.webContents.executeJavaScript(`document.querySelector('[data-e2e="following"]')?.parentElement?.click()`)
    const snapshot = await this.waitForWorkspaceValue<FollowingModalSnapshot>(FOLLOWING_MODAL_SNAPSHOT_SCRIPT, (value) => value.isOpen, 'TikTok did not open the following list.')
    this.mergeFollowingSnapshot(snapshot)
  }

  private async scrollFollowingModal() {
    const view = this.getWorkspaceView()
    await view.webContents.executeJavaScript(`(() => {
      const dialogs = [...document.querySelectorAll('[role="dialog"]')]
      const dialog = dialogs.find((candidate) => candidate.querySelector('a[href*="/@"]'))
      if (!dialog) return false
      const scrollable = [...dialog.querySelectorAll('*')]
        .filter((candidate) => candidate.scrollHeight > candidate.clientHeight + 4)
        .sort((left, right) => right.scrollHeight - left.scrollHeight)[0]
      if (!scrollable) return false
      scrollable.scrollTop = scrollable.scrollHeight
      scrollable.dispatchEvent(new Event('scroll', { bubbles: true }))
      return true
    })()`)
    await new Promise((resolve) => setTimeout(resolve, 700))
    const snapshot = await view.webContents.executeJavaScript(FOLLOWING_MODAL_SNAPSHOT_SCRIPT) as FollowingModalSnapshot
    this.mergeFollowingSnapshot(snapshot)
  }

  private mergeFollowingSnapshot(snapshot: FollowingModalSnapshot) {
    const found = new Map(this.followingAccounts.map((account) => [account.id, account]))
    for (const account of snapshot.accounts) found.set(account.id, account)
    this.followingAccounts = [...found.values()]
    if (snapshot.total !== undefined) this.followingTotal = snapshot.total
    if (this.followingTotal !== undefined && this.followingAccounts.length >= this.followingTotal) this.followingExhausted = true
  }

  private async toggleVideoState(videoId: string, kind: 'favorite' | 'like') {
    try {
      const username = this.videoAuthors.get(videoId)
      if (!username) throw new Error('TikTok did not return the video owner. Scan again before retrying.')
      const view = await this.openSignedInWorkspace()
      await view.webContents.executeJavaScript(`location.href = ${JSON.stringify(`${TIKTOK_ORIGIN}/@${encodeURIComponent(username)}/video/${encodeURIComponent(videoId)}?lang=en`)}`)
      // Use the first-party control so TikTok signs its own request, and report success only after its state changes.
      const selector = kind === 'like' ? '[data-e2e="like-icon"]' : '[data-e2e="favorite-icon"]'
      const desiredState = kind === 'like' ? 'false' : 'add'
      const current = await this.waitForWorkspaceValue<string | undefined>(`(() => {
        const control = document.querySelector(${JSON.stringify(selector)})
        if (!control) return undefined
        return ${kind === 'like' ? "control.getAttribute('aria-pressed') ?? undefined" : "control.getAttribute('aria-label')?.startsWith('Add to Favorites') ? 'add' : 'remove'"}
      })()`, (value) => value !== undefined, `TikTok did not expose the ${kind} control for this video.`)
      if (current === desiredState) return
      await view.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.click()`)
      await this.waitForWorkspaceValue<string | undefined>(`(() => {
        const control = document.querySelector(${JSON.stringify(selector)})
        if (!control) return undefined
        return ${kind === 'like' ? "control.getAttribute('aria-pressed') ?? undefined" : "control.getAttribute('aria-label')?.startsWith('Add to Favorites') ? 'add' : 'remove'"}
      })()`, (value) => value === desiredState, `TikTok did not confirm the ${kind === 'like' ? 'unlike' : 'remove-from-favorites'} action.`)
    } finally {
      this.restoreHostFocus()
    }
  }

  private restoreHostFocus() {
    this.workspaceWindow?.hide()
    const hostWindow = this.readHostWindow()
    if (hostWindow && !hostWindow.isDestroyed()) hostWindow.focus?.()
  }

  private activateWorkspace() {
    this.workspaceWindow?.show()
    this.workspaceWindow?.focus()
  }

  private async openSignedInWorkspace() {
    const view = await this.ensureWorkspaceLoaded()
    await this.loadOfficialPage(view, `${TIKTOK_ORIGIN}/foryou?lang=en`)
    await this.waitForWorkspaceValue<boolean>(`Boolean([...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Profile'))`, Boolean, 'TikTok did not load the signed-in navigation.')
    return view
  }

  private async waitForWorkspaceValue<T>(script: string, accept: (value: T) => boolean, message: string) {
    const deadline = Date.now() + 12_000
    while (Date.now() < deadline) {
      const value = await this.getWorkspaceView().webContents.executeJavaScript(script) as T
      if (accept(value)) return value
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    throw new Error(message)
  }
}
