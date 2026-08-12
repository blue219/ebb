import { BrowserWindow, session, WebContentsView, type Session } from 'electron'

import type {
  AccountSnapshot,
  DouyinVideo,
  LoginSnapshot,
  TaskCounts,
  TaskMode,
  TaskSnapshot,
  TaskState,
} from '../../../shared/platforms/douyin/contracts.js'
import {
  FAVORITES_PAGE_SIZE,
  isDouyinUrl,
  isSafeQrCodeDataUrl,
  registerDouyinNavigationGuards,
} from './policy.js'
import {
  createAutomaticRemovalPlan,
  hasReachedAutomaticTarget,
} from '../../shared/removal-policy.js'

type JsonObject = Record<string, unknown>
type StatusPublisher = (snapshot: TaskSnapshot) => void
type AccountPublisher = (snapshot: AccountSnapshot) => void
type LoginPublisher = (snapshot: LoginSnapshot) => void

const DOUYIN_ORIGIN = 'https://www.douyin.com'
const DOUYIN_API_ORIGIN = 'https://www-hj.douyin.com'
const DOUYIN_PARTITION = 'persist:ebb-douyin'

const LOGIN_SURFACE_SCRIPT = `
  (async () => {
    const isVisibleSquare = (element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width >= 100 && rect.width <= 600
        && rect.height >= 100 && rect.height <= 600
        && Math.abs(rect.width - rect.height) <= 24
        && style.display !== 'none'
        && style.visibility !== 'hidden'
    }

    const pageText = document.body?.innerText || ''
    if (/验证码|安全验证|完成验证|captcha|security verification/i.test(pageText)) {
      return { state: 'verification' }
    }
    if (/二维码.{0,12}(?:失效|过期)|QR code.{0,12}expired/i.test(pageText)) {
      const refreshControl = [...document.querySelectorAll('button, [role="button"]')].find((element) => (
        /刷新|Refresh/i.test(element.textContent || '') && !element.hasAttribute('disabled')
      ))
      if (refreshControl) refreshControl.click()
      return { state: 'loading' }
    }

    const imageSelectors = [
      'img[aria-label*="二维码"]',
      'img[alt*="二维码"]',
      '[class*="qrcode" i] img',
      '[class*="qr-code" i] img',
    ]
    const image = [...document.querySelectorAll(imageSelectors.join(','))].find(isVisibleSquare)
    if (image) {
      const source = image.currentSrc || image.src
      if (source.startsWith('data:image/')) return { state: 'ready', qrCode: source }
      if (source) {
        try {
          const response = await fetch(source, { credentials: 'include' })
          const blob = await response.blob()
          const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
          if (blob.size > 750_000 || !allowedTypes.includes(blob.type.toLowerCase())) return { state: 'loading' }
          const qrCode = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(blob)
          })
          return { state: 'ready', qrCode }
        } catch {}
      }
    }

    const canvasSelectors = ['[class*="qrcode" i] canvas', '[class*="qr-code" i] canvas']
    const canvas = [...document.querySelectorAll(canvasSelectors.join(','))].find(isVisibleSquare)
    if (canvas) {
      try {
        return { state: 'ready', qrCode: canvas.toDataURL('image/png') }
      } catch {}
    }

    // Douyin may render the login trigger as a plain text div without button semantics.
    const loginControl = [...document.querySelectorAll('button, [role="button"], a, [tabindex], div, span')].find((element) => {
      const text = element.textContent?.trim()
      return (text === '登录' || text === 'Login')
        && element.children.length === 0
        && !element.hasAttribute('disabled')
    })
    if (loginControl) loginControl.click()
    return { state: 'loading' }
  })()
`

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null

const readString = (value: JsonObject, key: string) => {
  const candidate = value[key]
  return typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : undefined
}

const readNumber = (value: JsonObject, key: string) => {
  const raw = value[key]
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined
  const candidate = Number(raw)
  return Number.isFinite(candidate) ? candidate : undefined
}

export class DouyinTaskService {
  private hostWindow?: BrowserWindow
  private workView?: WebContentsView
  private loginPoll?: NodeJS.Timeout
  private loginAccountPoll?: NodeJS.Timeout
  private loginPollPending = false
  private loginAccountPollPending = false
  private loginQrCapturedAt = 0
  private loginVisible = false
  private workspaceLoad?: Promise<void>
  private state: TaskState = 'idle'
  private videos: DouyinVideo[] = []
  private currentVideoId?: string
  private nextCursor = '0'
  private hasMore = false
  private isLoadingMore = false
  private secUserId?: string
  private message?: string
  private isRunning = false
  private taskMode?: TaskMode
  private taskIds = new Set<string>()
  private taskProcessedIds = new Set<string>()
  private replacementVideos: DouyinVideo[] = []
  private taskCompleted = 0
  private taskTotal = 0
  private readonly publish: StatusPublisher
  private readonly publishAccount: AccountPublisher
  private readonly publishLogin: LoginPublisher
  private account: AccountSnapshot = { state: 'checking' }
  private login: LoginSnapshot = { state: 'idle' }

  constructor(publish: StatusPublisher, publishAccount: AccountPublisher, publishLogin: LoginPublisher) {
    this.publish = publish
    this.publishAccount = publishAccount
    this.publishLogin = publishLogin
  }

  async initialize(hostWindow: BrowserWindow) {
    this.hideLogin()
    this.hostWindow = hostWindow
    await this.ensureWorkspaceLoaded()
    await this.refreshAccount()
  }

  getTaskSnapshot() {
    return this.createSnapshot()
  }

  getAccountSnapshot() {
    return { ...this.account }
  }

  getLoginSnapshot() {
    return { ...this.login }
  }

  async showLogin() {
    await this.ensureWorkspaceLoaded()
    this.loginVisible = true
    if (this.login.state !== 'ready' || Date.now() - this.loginQrCapturedAt > 60_000) {
      this.setLoginSnapshot({ state: 'loading' })
    }
    this.startLoginPolling()
    void this.pollLogin()
    void this.pollLoginAccount()
  }

  async refreshLogin() {
    const workView = await this.ensureWorkspaceLoaded()
    this.setLoginSnapshot({ state: 'loading' })
    await workView.webContents.loadURL(DOUYIN_ORIGIN)
    if (this.loginVisible) await this.pollLogin()
  }

  hideLogin() {
    this.stopLoginPolling()
    this.loginVisible = false
  }

  dispose() {
    this.hideLogin()
    if (this.workView && !this.workView.webContents.isDestroyed()) this.workView.webContents.close()
    this.workView = undefined
    this.workspaceLoad = undefined
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
    // The view stays detached, but a stable viewport is required for responsive login controls to render.
    workView.setBounds({ x: 0, y: 0, width: 1280, height: 800 })
    workView.setBorderRadius(18)
    registerDouyinNavigationGuards(workView.webContents)
    workView.webContents.on('render-process-gone', () => {
      this.stopLoginPolling()
      this.setLoginSnapshot({ state: 'error', message: 'The Douyin sign-in process stopped unexpectedly.' })
      this.account = { state: 'signedOut', message: 'The Douyin sign-in page stopped unexpectedly. Try again.' }
      this.publishAccountSnapshot()
    })
    this.workView = workView
    return workView
  }

  async scan() {
    await this.ensureSignedIn()
    this.state = 'scanning'
    this.resetTask()
    this.videos = []
    this.replacementVideos = []
    this.nextCursor = '0'
    this.hasMore = false
    this.message = 'Loading the first 10 liked videos.'
    this.publishSnapshot()

    try {
      await this.loadNextPage()
      this.state = 'ready'
      this.message = this.videos.length
        ? `Loaded ${this.videos.length} liked videos.${this.hasMore ? ' Scroll down to load more.' : ''}`
        : 'No liked videos were returned. Confirm that the saved Douyin account is signed in, then scan again.'
    } catch (error) {
      this.state = 'paused'
      this.message = this.errorMessage(error)
    }

    this.publishSnapshot()
  }

  async loadMore() {
    if ((!this.hasMore && !this.replacementVideos.length) || this.isLoadingMore || !['ready', 'completed', 'stopped'].includes(this.state)) return
    const previousState = this.state
    try {
      await this.ensureSignedIn()
      if (!this.appendReplacementVideos(FAVORITES_PAGE_SIZE)) await this.loadNextPage()
      this.message = `Loaded ${this.videos.length} liked videos.${this.hasMore ? ' Scroll down to load more.' : ''}`
    } catch (error) {
      if (previousState === 'ready') this.state = 'paused'
      this.message = this.errorMessage(error)
    }
    this.publishSnapshot()
  }

  start(selectedIds: string[]) {
    if (!selectedIds.length) throw new Error('Select at least one video before starting.')
    if (this.isRunning) return

    const selected = new Set(selectedIds)
    const knownIds = new Set(this.videos.map((video) => video.id))
    if (selectedIds.some((id) => !knownIds.has(id))) throw new Error('The selection is no longer available. Scan again.')

    this.taskMode = 'selected'
    this.taskIds = selected
    this.taskProcessedIds = new Set()
    this.taskCompleted = 0
    this.taskTotal = selectedIds.length
    for (const video of this.videos) {
      if (selected.has(video.id) && video.status !== 'completed') video.status = 'pending'
    }
    this.state = 'running'
    this.message = 'Removing likes through the Douyin web API.'
    this.publishSnapshot(selected)
    void this.processQueue(selected)
  }

  async startAll(limit?: number) {
    if (this.isRunning) return
    await this.ensureSignedIn()

    const pendingCount = this.videos.filter((video) => video.status !== 'completed').length
    const plan = createAutomaticRemovalPlan(limit, this.account.likesCount, pendingCount)
    this.taskMode = plan.mode
    this.taskIds = new Set()
    this.replacementVideos = []
    this.taskProcessedIds = new Set(this.videos.filter((video) => video.status === 'completed').map((video) => video.id))
    this.taskCompleted = 0
    this.taskTotal = plan.total
    for (const video of this.videos) {
      if (video.status !== 'completed') video.status = 'pending'
    }
    this.state = 'running'
    this.message = plan.mode === 'all'
      ? 'Removing every liked video and loading new batches until none remain.'
      : `Removing up to ${plan.total} liked videos.`
    this.publishSnapshot()
    void this.processAllLikes()
  }

  pause() {
    if (this.state !== 'running') return
    this.state = 'paused'
    this.message = 'Paused by you. No further API requests will be sent until you continue.'
    this.publishSnapshot(this.taskMode === 'selected' ? this.taskIds : undefined)
  }

  resume(selectedIds: string[]) {
    if (this.state !== 'paused') return
    if (!this.taskMode) return

    if (this.taskMode === 'selected') {
      const knownIds = new Set(this.videos.map((video) => video.id))
      if (!selectedIds.length || selectedIds.some((id) => !knownIds.has(id))) {
        throw new Error('The selection is no longer available. Scan again.')
      }
      this.taskIds = new Set(selectedIds)
      for (const video of this.videos) {
        if (this.taskIds.has(video.id) && video.status === 'failed') video.status = 'pending'
      }
    } else {
      for (const video of this.videos) {
        if (video.status === 'failed') video.status = 'pending'
      }
    }

    this.state = 'running'
    this.message = this.taskMode === 'all'
      ? 'Continuing removal of every liked video.'
      : this.taskMode === 'limited'
        ? `Continuing removal of up to ${this.taskTotal} liked videos.`
        : 'Continuing removal of the selected liked videos.'
    this.publishSnapshot(this.taskMode === 'selected' ? this.taskIds : undefined)
    // An in-flight worker observes the restored running state before sending its next request.
    if (this.isRunning) return
    if (this.taskMode === 'selected') void this.processQueue(this.taskIds)
    else void this.processAllLikes()
  }

  stop() {
    if (!['running', 'paused'].includes(this.state)) return
    this.state = 'stopped'
    this.currentVideoId = undefined
    this.message = this.taskMode === 'selected'
      ? 'Task stopped. Unprocessed videos remain selected.'
      : 'Automatic removal stopped. Liked videos remain.'
    this.publishSnapshot(this.taskMode === 'selected' ? this.taskIds : undefined)
  }

  async signOut() {
    this.stop()
    this.hideLogin()
    this.setLoginSnapshot({ state: 'idle' })
    await session.fromPartition(DOUYIN_PARTITION).clearStorageData()
    if (this.workView && !this.workView.webContents.isDestroyed()) await this.workView.webContents.loadURL(DOUYIN_ORIGIN)
    this.account = { state: 'signedOut' }
    this.secUserId = undefined
    this.nextCursor = '0'
    this.hasMore = false
    this.publishAccountSnapshot()
    this.state = 'idle'
    this.resetTask()
    this.videos = []
    this.message = 'Signed out from Douyin on this device.'
    this.publishSnapshot()
  }

  private async processQueue(selectedIds: Set<string>) {
    this.isRunning = true
    try {
      await this.ensureSignedIn()
      for (const video of this.videos) {
        if (!selectedIds.has(video.id) || video.status === 'completed') continue
        if (this.state !== 'running') return

        this.currentVideoId = video.id
        video.status = 'processing'
        this.publishSnapshot(selectedIds)

        try {
          const payload = await this.requestApi('/aweme/v1/web/commit/item/digg/', {
            aid: '6383',
            aweme_id: video.id,
            type: '0',
          }, 'POST')
          this.throwIfApiError(payload)
          video.status = 'completed'
          this.taskCompleted += 1
          if (this.account.likesCount !== undefined && this.account.likesCount > 0) {
            this.account = { ...this.account, likesCount: this.account.likesCount - 1 }
            this.publishAccountSnapshot()
          }
        } catch (error) {
          video.status = 'failed'
          this.state = 'paused'
          this.message = this.errorMessage(error)
          this.publishSnapshot(selectedIds)
          return
        }

        this.currentVideoId = undefined
        this.publishSnapshot(selectedIds)
        try {
          await this.loadReplacementVideo()
        } catch {
          // A replacement fetch must not turn a successful unlike operation into a failed removal.
        }
        this.publishSnapshot(selectedIds)
        await sleep(180 + Math.round(Math.random() * 140))
      }

      if (this.state === 'running') {
        this.state = 'completed'
        this.message = 'The selected videos have been processed.'
        this.publishSnapshot(selectedIds)
      }
    } catch (error) {
      this.state = 'paused'
      this.message = this.errorMessage(error)
      this.publishSnapshot(selectedIds)
    } finally {
      this.isRunning = false
    }
  }

  private async processAllLikes() {
    this.isRunning = true
    try {
      await this.ensureSignedIn()
      while (this.state === 'running') {
        if (this.taskMode && this.taskMode !== 'selected' && hasReachedAutomaticTarget(this.taskMode, this.taskCompleted, this.taskTotal)) {
          this.completeAutomaticTask(false)
          return
        }

        const pendingVideos = this.videos.filter((video) => video.status !== 'completed')
        if (!pendingVideos.length) {
          await this.loadNextAutomaticBatch()
          if (this.state !== 'running') return
          if (!this.videos.length) {
            this.completeAutomaticTask(true)
            return
          }
          continue
        }

        for (const video of pendingVideos) {
          if (this.state !== 'running') return
          if (this.taskMode && this.taskMode !== 'selected' && hasReachedAutomaticTarget(this.taskMode, this.taskCompleted, this.taskTotal)) {
            this.completeAutomaticTask(false)
            return
          }

          this.currentVideoId = video.id
          video.status = 'processing'
          this.publishSnapshot()

          try {
            const payload = await this.requestApi('/aweme/v1/web/commit/item/digg/', {
              aid: '6383',
              aweme_id: video.id,
              type: '0',
            }, 'POST')
            this.throwIfApiError(payload)
            video.status = 'completed'
            this.taskProcessedIds.add(video.id)
            this.taskCompleted += 1
            if (this.account.likesCount !== undefined && this.account.likesCount > 0) {
              this.account = { ...this.account, likesCount: this.account.likesCount - 1 }
              this.publishAccountSnapshot()
            }
          } catch (error) {
            video.status = 'failed'
            this.state = 'paused'
            this.message = this.errorMessage(error)
            this.publishSnapshot()
            return
          }

          this.currentVideoId = undefined
          this.publishSnapshot()
          if (this.taskMode && this.taskMode !== 'selected' && hasReachedAutomaticTarget(this.taskMode, this.taskCompleted, this.taskTotal)) {
            this.completeAutomaticTask(false)
            return
          }
          await sleep(180 + Math.round(Math.random() * 140))
        }
      }
    } catch (error) {
      this.state = 'paused'
      this.message = this.errorMessage(error)
      this.publishSnapshot()
    } finally {
      this.isRunning = false
    }
  }

  private async loadNextAutomaticBatch() {
    this.message = 'Loading the next batch of liked videos.'
    this.replacementVideos = []

    // Start at the first page after each mutation because later videos shift forward as likes are removed.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      this.videos = []
      this.nextCursor = '0'
      this.hasMore = true
      do {
        await this.loadNextPage()
        this.videos = this.videos.filter((video) => !this.taskProcessedIds.has(video.id))
      } while (this.state === 'running' && !this.videos.length && this.hasMore)

      if (this.videos.length || !this.account.likesCount || this.state !== 'running') {
        this.publishSnapshot()
        return
      }
      await sleep(600 * (attempt + 1))
    }

    throw new Error('Douyin still reports liked videos but did not return a new batch. Continue to retry.')
  }

  private completeAutomaticTask(exhausted: boolean) {
    const mode = this.taskMode
    this.state = 'completed'
    this.currentVideoId = undefined
    if (mode === 'limited') {
      if (exhausted && this.taskCompleted < this.taskTotal) this.taskTotal = this.taskCompleted
      this.message = `Removed ${this.taskCompleted} liked videos.`
    } else {
      this.hasMore = false
      this.account = { ...this.account, likesCount: 0 }
      this.message = 'All liked videos have been removed.'
      this.publishAccountSnapshot()
    }
    this.publishSnapshot()
  }

  private appendReplacementVideos(limit: number) {
    const knownIds = new Set(this.videos.map((video) => video.id))
    let appended = 0
    while (this.replacementVideos.length && appended < limit) {
      const video = this.replacementVideos.shift()
      if (!video || knownIds.has(video.id)) continue
      this.videos.push(video)
      knownIds.add(video.id)
      appended += 1
    }
    return appended
  }

  private async loadReplacementVideo() {
    if (this.appendReplacementVideos(1)) return

    // Fetch one normal page into a private buffer, then reveal only one replacement per removal.
    while (this.hasMore) {
      const currentVideos = [...this.videos]
      const currentIds = new Set(currentVideos.map((video) => video.id))
      await this.loadNextPage()
      const fetchedVideos = this.videos.filter((video) => !currentIds.has(video.id))
      this.videos = currentVideos
      this.replacementVideos.push(...fetchedVideos)
      if (this.appendReplacementVideos(1)) return
    }
  }

  private resetTask() {
    this.taskMode = undefined
    this.taskIds = new Set()
    this.taskProcessedIds = new Set()
    this.replacementVideos = []
    this.taskCompleted = 0
    this.taskTotal = 0
  }

  private async getCurrentUser() {
    const payload = await this.requestApi('/aweme/v1/web/user/profile/self/', { aid: '6383' })
    this.throwIfApiError(payload)

    const data = isObject(payload.data) ? payload.data : undefined
    const candidates = [payload.user, payload.user_info, data?.user, data?.user_info, data].filter(isObject)
    for (const user of candidates) {
      const secUserId = readString(user, 'sec_uid') ?? readString(user, 'sec_user_id')
      if (!secUserId) continue
      const avatarObject = isObject(user.avatar_thumb) ? user.avatar_thumb : undefined
      const avatarSources = avatarObject && Array.isArray(avatarObject.url_list) ? avatarObject.url_list : []
      return {
        secUserId,
        name: readString(user, 'nickname') ?? readString(user, 'unique_id') ?? 'Douyin user',
        avatar: avatarSources.find((source): source is string => typeof source === 'string'),
        likesCount: readNumber(user, 'favoriting_count'),
      }
    }
    throw new Error('Douyin did not return the current user. Sign in again and retry.')
  }

  private toVideo(record: JsonObject): DouyinVideo | undefined {
    const id = readString(record, 'aweme_id')
    if (!id) return undefined

    const video = isObject(record.video) ? record.video : undefined
    const cover = video && isObject(video.cover) ? video.cover : undefined
    const sources = cover && Array.isArray(cover.url_list) ? cover.url_list : []
    const thumbnail = sources.find((source): source is string => typeof source === 'string')
    return {
      id,
      title: readString(record, 'desc') || 'Untitled video',
      thumbnail,
      status: 'pending',
    }
  }

  private async requestApi(path: string, query: Record<string, string>, method: 'GET' | 'POST' = 'GET') {
    const url = new URL(path, DOUYIN_API_ORIGIN)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    const webContents = this.getWorkspaceView().webContents
    if (!isDouyinUrl(webContents.getURL())) {
      throw new Error('Wait for the Douyin sign-in page to finish loading, then scan again.')
    }

    // Douyin validates the browser page context in addition to the signed-in session cookies.
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
    if (!isObject(result) || typeof result.text !== 'string') {
      throw new Error('Douyin returned an unreadable API response.')
    }

    const text = result.text
    let payload: JsonObject
    try {
      const parsed: unknown = JSON.parse(text)
      payload = isObject(parsed) ? parsed : { status_code: result.status, status_msg: text.slice(0, 240) }
    } catch {
      payload = { status_code: result.status, status_msg: text.slice(0, 240) }
    }
    if (!result.ok && payload.status_code === undefined) payload.status_code = result.status
    return payload
  }

  private throwIfApiError(payload: JsonObject) {
    const code = payload.status_code ?? payload.statusCode
    if (code === undefined || Number(code) === 0) return
    const detail = readString(payload, 'status_msg') ?? readString(payload, 'message') ?? `status ${String(code)}`
    throw new Error(`Douyin API request was rejected: ${detail}`)
  }

  private getWorkspaceSession(): Session {
    this.getWorkspaceView()
    return session.fromPartition(DOUYIN_PARTITION)
  }

  private getHostWindow() {
    if (!this.hostWindow || this.hostWindow.isDestroyed()) throw new Error('The Ebb window is not available.')
    return this.hostWindow
  }

  private getWorkspaceView() {
    if (!this.workView || this.workView.webContents.isDestroyed()) {
      throw new Error('The Douyin sign-in page is not available.')
    }
    return this.workView
  }

  private async ensureWorkspaceLoaded() {
    this.getHostWindow()
    const workView = this.workView && !this.workView.webContents.isDestroyed()
      ? this.workView
      : this.createWorkspaceView()
    // Startup and the immediately visible login panel may request the workspace concurrently.
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

  private async ensureSignedIn() {
    this.getWorkspaceSession()
    if (this.account.state !== 'signedIn') await this.refreshAccount()
    if (this.account.state !== 'signedIn') throw new Error('Scan the QR code to sign in before scanning likes.')
  }

  private async refreshAccount() {
    this.account = { state: 'checking' }
    this.publishAccountSnapshot()
    try {
      const user = await this.getCurrentUser()
      this.getWorkspaceSession().flushStorageData()
      this.secUserId = user.secUserId
      this.account = { state: 'signedIn', name: user.name, avatar: user.avatar, likesCount: user.likesCount }
      this.publishAccountSnapshot()
      if (this.loginVisible) {
        this.hideLogin()
        this.setLoginSnapshot({ state: 'idle' })
      }
    } catch (error) {
      this.account = { state: 'signedOut', message: this.errorMessage(error) }
      this.publishAccountSnapshot()
    }
    return this.account
  }

  private startLoginPolling() {
    this.stopLoginPolling()
    // QR discovery is cheap and should never wait for the slower authenticated profile probe.
    this.loginPoll = setInterval(() => {
      void this.pollLogin()
    }, 250)
    this.loginAccountPoll = setInterval(() => {
      void this.pollLoginAccount()
    }, 1_500)
  }

  private stopLoginPolling() {
    if (this.loginPoll) clearInterval(this.loginPoll)
    if (this.loginAccountPoll) clearInterval(this.loginAccountPoll)
    this.loginPoll = undefined
    this.loginAccountPoll = undefined
    this.loginPollPending = false
    this.loginAccountPollPending = false
  }

  private async pollLogin() {
    if (!this.loginVisible || this.loginPollPending) return
    this.loginPollPending = true
    try {
      const surface = await this.readLoginSurface()
      if (surface.state === 'ready') {
        this.setLoginSnapshot({ state: 'ready', qrCode: surface.qrCode })
      } else if (surface.state === 'verification') {
        this.setLoginSnapshot({ state: 'verification' })
      } else {
        this.setLoginSnapshot({ state: 'loading' })
      }
    } catch (error) {
      this.setLoginSnapshot({ state: 'error', message: this.errorMessage(error) })
    } finally {
      this.loginPollPending = false
    }
  }

  private async pollLoginAccount() {
    if (!this.loginVisible || this.loginAccountPollPending) return
    this.loginAccountPollPending = true
    try {
      const user = await this.getCurrentUser()
      this.getWorkspaceSession().flushStorageData()
      this.secUserId = user.secUserId
      this.account = { state: 'signedIn', name: user.name, avatar: user.avatar, likesCount: user.likesCount }
      this.publishAccountSnapshot()
      this.hideLogin()
      this.setLoginSnapshot({ state: 'idle' })
    } catch {
      // A failed profile probe is expected until QR authorization completes.
    } finally {
      this.loginAccountPollPending = false
    }
  }

  private async readLoginSurface(): Promise<LoginSnapshot> {
    const result: unknown = await this.getWorkspaceView().webContents.executeJavaScript(LOGIN_SURFACE_SCRIPT)
    if (!isObject(result)) throw new Error('Douyin did not return a readable QR code state.')
    if (result.state === 'ready') {
      if (!isSafeQrCodeDataUrl(result.qrCode)) throw new Error('Douyin returned an invalid QR code image.')
      return { state: 'ready', qrCode: result.qrCode }
    }
    if (result.state === 'verification') return { state: 'verification' }
    return { state: 'loading' }
  }

  private setLoginSnapshot(snapshot: LoginSnapshot) {
    if (
      snapshot.state === this.login.state
      && snapshot.qrCode === this.login.qrCode
      && snapshot.message === this.login.message
    ) return
    this.login = snapshot
    if (snapshot.state === 'ready') this.loginQrCapturedAt = Date.now()
    if (snapshot.state === 'idle') this.loginQrCapturedAt = 0
    this.publishLogin({ ...snapshot })
  }

  private publishAccountSnapshot() {
    this.publishAccount({ ...this.account })
  }

  private async loadNextPage() {
    if (this.isLoadingMore) return
    this.isLoadingMore = true
    this.publishSnapshot()
    try {
      if (!this.secUserId) this.secUserId = (await this.getCurrentUser()).secUserId
      const cursor = this.nextCursor
      const payload = await this.requestApi('/aweme/v1/web/aweme/favorite/', {
        aid: '6383',
        count: String(FAVORITES_PAGE_SIZE),
        max_cursor: cursor,
        sec_user_id: this.secUserId,
      })
      this.throwIfApiError(payload)

      const found = new Map(this.videos.map((video) => [video.id, video]))
      const records = Array.isArray(payload.aweme_list)
        ? payload.aweme_list.filter(isObject)
        : []
      for (const record of records) {
        const video = this.toVideo(record)
        if (video) found.set(video.id, video)
      }
      this.videos = [...found.values()]

      const nextCursor = readString(payload, 'max_cursor')
      this.hasMore = Boolean(payload.has_more && nextCursor && nextCursor !== cursor)
      if (nextCursor) this.nextCursor = nextCursor
    } finally {
      this.isLoadingMore = false
    }
  }

  private createSnapshot(selectedIds = new Set<string>()): TaskSnapshot {
    const counts: TaskCounts = {
      loaded: this.videos.length,
      selected: this.videos.filter((video) => selectedIds.has(video.id)).length,
      completed: this.taskMode ? this.taskCompleted : this.videos.filter((video) => video.status === 'completed').length,
      failed: this.videos.filter((video) => video.status === 'failed').length,
    }
    return {
      state: this.state,
      mode: this.taskMode,
      videos: [...this.videos],
      counts,
      progress: {
        completed: this.taskCompleted,
        total: this.taskTotal,
      },
      currentVideoId: this.currentVideoId,
      hasMore: this.hasMore || this.replacementVideos.length > 0,
      isLoadingMore: this.isLoadingMore,
      message: this.message,
    }
  }

  private publishSnapshot(selectedIds = new Set<string>()) {
    this.publish(this.createSnapshot(selectedIds))
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'An unexpected task error occurred.'
  }
}
