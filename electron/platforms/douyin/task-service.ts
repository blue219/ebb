import type {
  AccountSnapshot,
  DouyinVideo,
  LoginSnapshot,
  TaskCounts,
  TaskMode,
  TaskSnapshot,
  TaskState,
} from '../../../shared/platforms/douyin/contracts.js'
import { FAVORITES_PAGE_SIZE } from './policy.js'
import type { DouyinClient } from './client.js'
import {
  createAutomaticRemovalPlan,
  hasReachedAutomaticTarget,
} from '../../shared/removal-policy.js'

type StatusPublisher = (snapshot: TaskSnapshot) => void
type AccountPublisher = (snapshot: AccountSnapshot) => void
type LoginPublisher = (snapshot: LoginSnapshot) => void

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

export class DouyinTaskService {
  private loginPoll?: NodeJS.Timeout
  private loginAccountPoll?: NodeJS.Timeout
  private loginPollPending = false
  private loginAccountPollPending = false
  private loginQrCapturedAt = 0
  private loginVisible = false
  private stopCrashListener?: () => void
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
  private readonly client: DouyinClient
  private readonly wait: (milliseconds: number) => Promise<void>
  private account: AccountSnapshot = { state: 'checking' }
  private login: LoginSnapshot = { state: 'idle' }

  constructor(
    client: DouyinClient,
    publish: StatusPublisher,
    publishAccount: AccountPublisher,
    publishLogin: LoginPublisher,
    wait: (milliseconds: number) => Promise<void> = sleep,
  ) {
    this.client = client
    this.publish = publish
    this.publishAccount = publishAccount
    this.publishLogin = publishLogin
    this.wait = wait
  }

  async initialize() {
    this.hideLogin()
    this.stopCrashListener = this.client.onWorkspaceCrash(() => this.handleWorkspaceCrash())
    await this.client.initialize()
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
    await this.client.initialize()
    this.loginVisible = true
    if (this.login.state !== 'ready' || Date.now() - this.loginQrCapturedAt > 60_000) {
      this.setLoginSnapshot({ state: 'loading' })
    }
    this.startLoginPolling()
    void this.pollLogin()
    void this.pollLoginAccount()
  }

  async refreshLogin() {
    this.setLoginSnapshot({ state: 'loading' })
    await this.client.refreshLogin()
    if (this.loginVisible) await this.pollLogin()
  }

  hideLogin() {
    this.stopLoginPolling()
    this.loginVisible = false
  }

  dispose() {
    this.hideLogin()
    this.stopCrashListener?.()
    this.stopCrashListener = undefined
    this.client.dispose()
  }

  private handleWorkspaceCrash() {
    this.stopLoginPolling()
    this.setLoginSnapshot({ state: 'error', message: 'The Douyin sign-in process stopped unexpectedly.' })
    this.account = { state: 'signedOut', message: 'The Douyin sign-in page stopped unexpectedly. Try again.' }
    this.publishAccountSnapshot()
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
    await this.client.clearSession()
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
          await this.client.unlike(video.id)
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
        await this.wait(180 + Math.round(Math.random() * 140))
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
            await this.client.unlike(video.id)
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
          await this.wait(180 + Math.round(Math.random() * 140))
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
      await this.wait(600 * (attempt + 1))
    }

    if (this.taskMode === 'limited') {
      this.videos = []
      this.hasMore = false
      this.publishSnapshot()
      return
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

  private async ensureSignedIn() {
    if (this.account.state !== 'signedIn') await this.refreshAccount()
    if (this.account.state !== 'signedIn') throw new Error('Scan the QR code to sign in before scanning likes.')
  }

  private async refreshAccount() {
    this.account = { state: 'checking' }
    this.publishAccountSnapshot()
    try {
      const user = await this.client.getCurrentUser()
      this.client.flushSession()
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
      const user = await this.client.getCurrentUser()
      this.client.flushSession()
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
    return this.client.readLoginSurface()
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
      if (!this.secUserId) this.secUserId = (await this.client.getCurrentUser()).secUserId
      const cursor = this.nextCursor
      const page = await this.client.loadFavorites(this.secUserId, cursor, FAVORITES_PAGE_SIZE)
      const found = new Map(this.videos.map((video) => [video.id, video]))
      for (const video of page.videos) found.set(video.id, video)
      this.videos = [...found.values()]
      this.hasMore = page.hasMore
      if (page.nextCursor) this.nextCursor = page.nextCursor
    } finally {
      this.isLoadingMore = false
    }
  }

  private createSnapshot(selectedIds = new Set<string>()): TaskSnapshot {
    let selected = 0
    let completed = 0
    let failed = 0
    // Snapshot publication is a hot path during removal, so collect all counts in one pass.
    for (const video of this.videos) {
      if (selectedIds.has(video.id)) selected += 1
      if (video.status === 'completed') completed += 1
      else if (video.status === 'failed') failed += 1
    }
    const counts: TaskCounts = {
      loaded: this.videos.length,
      selected,
      completed: this.taskMode ? this.taskCompleted : completed,
      failed,
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
