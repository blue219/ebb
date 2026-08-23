import type {
  AccountSnapshot,
  VideoItem,
  LoginSnapshot,
  TaskCounts,
  TaskMode,
  TaskSnapshot,
  TaskState,
} from '../../../shared/platforms/contracts.js'
import {
  DOUYIN_RUNTIME_CONFIG,
  type PlatformClient,
  type PlatformRuntimeConfig,
} from './client.js'
import { PlatformMutationCoordinator, type PlatformMutationKind } from './mutation-coordinator.js'
import {
  createAutomaticRemovalPlan,
  hasReachedAutomaticTarget,
  remainingAutomaticTarget,
} from '../removal-policy.js'

type StatusPublisher = (snapshot: TaskSnapshot) => void
type AccountPublisher = (snapshot: AccountSnapshot) => void
type LoginPublisher = (snapshot: LoginSnapshot) => void

export type VideoItemTaskKind = 'likes' | 'collections'

export interface VideoItemTaskOptions {
  kind?: VideoItemTaskKind
  ownsClient?: boolean
  runtime?: PlatformRuntimeConfig
}

const videoTaskConfig = {
  likes: {
    accountCount: 'likedVideosCount',
    itemLabel: 'liked video',
    itemPluralLabel: 'liked videos',
    ownerKind: 'likes',
    pageSize: 'favoritesPageSize',
    taskLabel: 'like',
  },
  collections: {
    accountCount: 'collectedVideosCount',
    itemLabel: 'collected video',
    itemPluralLabel: 'collected videos',
    ownerKind: 'collections',
    pageSize: 'collectionsPageSize',
    taskLabel: 'collection',
  },
} as const satisfies Record<VideoItemTaskKind, {
  accountCount: 'likedVideosCount' | 'collectedVideosCount'
  itemLabel: string
  itemPluralLabel: string
  ownerKind: PlatformMutationKind
  pageSize: 'favoritesPageSize' | 'collectionsPageSize'
  taskLabel: string
}>

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

export class PlatformTaskService {
  private loginPoll?: NodeJS.Timeout
  private loginAccountPoll?: NodeJS.Timeout
  private loginPollPending = false
  private loginAccountProbe?: Promise<boolean>
  private loginSetup?: Promise<void>
  private loginVisible = false
  private stopCrashListener?: () => void
  private state: TaskState = 'idle'
  private videos: VideoItem[] = []
  private currentVideoId?: string
  private nextCursor = '0'
  private hasMore = false
  private isLoadingMore = false
  private isRefreshingCompletedList = false
  private completionRefreshError?: string
  private id?: string
  private message?: string
  private isRunning = false
  private taskMode?: TaskMode
  private taskIds = new Set<string>()
  private taskProcessedIds = new Set<string>()
  private replacementVideos: VideoItem[] = []
  private automaticPrefetch?: Promise<void>
  private automaticPrefetchGeneration = 0
  private taskCompleted = 0
  private taskTotal: number | null = 0
  private readonly publish: StatusPublisher
  private readonly publishAccount: AccountPublisher
  private readonly publishLogin: LoginPublisher
  private readonly client: PlatformClient
  private readonly wait: (milliseconds: number) => Promise<void>
  private readonly mutationCoordinator: PlatformMutationCoordinator
  private readonly options: Required<Omit<VideoItemTaskOptions, 'runtime'>>
  private readonly runtime: PlatformRuntimeConfig
  private account: AccountSnapshot = { state: 'checking' }
  private login: LoginSnapshot = { state: 'idle' }

  constructor(
    client: PlatformClient,
    publish: StatusPublisher,
    publishAccount: AccountPublisher,
    publishLogin: LoginPublisher,
    wait: (milliseconds: number) => Promise<void> = sleep,
    mutationCoordinator: PlatformMutationCoordinator = new PlatformMutationCoordinator(),
    options: VideoItemTaskOptions = {},
  ) {
    this.client = client
    this.publish = publish
    this.publishAccount = publishAccount
    this.publishLogin = publishLogin
    this.wait = wait
    this.mutationCoordinator = mutationCoordinator
    this.options = { kind: options.kind ?? 'likes', ownsClient: options.ownsClient ?? true }
    this.runtime = options.runtime ?? DOUYIN_RUNTIME_CONFIG
  }

  private get config() {
    const config = videoTaskConfig[this.options.kind]
    return {
      ...config,
      emptyMessage: `No ${config.itemPluralLabel} were returned. Confirm that the saved ${this.runtime.displayName} account is signed in, then scan again.`,
      owner: `${this.runtime.id}:${config.ownerKind}` as const,
      pageSize: this.runtime[config.pageSize],
    }
  }

  private get accountItemCount() {
    return this.account[this.config.accountCount]
  }

  private decrementAccountItemCount() {
    const count = this.accountItemCount
    if (count === undefined || count <= 0) return
    this.account = { ...this.account, [this.config.accountCount]: count - 1 }
    this.publishAccountSnapshot()
  }

  private loadVideos(id: string, cursor: string, count: number) {
    return this.options.kind === 'likes'
      ? this.client.loadFavorites(id, cursor, count)
      : this.client.loadCollections(id, cursor, count)
  }

  private removeVideo(videoId: string) {
    return this.options.kind === 'likes' ? this.client.unlike(videoId) : this.client.uncollect(videoId)
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

  async requireSignedInUserId() {
    await this.ensureSignedIn()
    if (!this.id) this.id = (await this.client.getCurrentUser()).id
    return this.id
  }

  decrementFollowingCount() {
    if (this.account.followingCount === undefined || this.account.followingCount <= 0) return
    this.account = { ...this.account, followingCount: this.account.followingCount - 1 }
    this.publishAccountSnapshot()
  }

  decrementCollectionCount() {
    if (this.account.collectedVideosCount === undefined || this.account.collectedVideosCount <= 0) return
    this.account = { ...this.account, collectedVideosCount: this.account.collectedVideosCount - 1 }
    this.publishAccountSnapshot()
  }

  async showLogin() {
    this.loginVisible = true
    this.setLoginSnapshot({ state: 'loading' })
    if (this.loginSetup) {
      await this.loginSetup
      return
    }

    // React StrictMode may remount the renderer effect while the hidden page is still loading.
    const setup = (async () => {
      await this.client.initialize()
      await this.client.refreshLogin()
    })()
    this.loginSetup = setup
    try {
      await setup
    } finally {
      if (this.loginSetup === setup) this.loginSetup = undefined
    }
    if (!this.loginVisible) return
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
    this.mutationCoordinator.release(this.config.owner)
    if (this.options.ownsClient) this.client.dispose()
  }

  handleWorkspaceCrash() {
    this.stopLoginPolling()
    this.setLoginSnapshot({ state: 'error', message: `The ${this.runtime.displayName} sign-in process stopped unexpectedly.` })
    this.account = { state: 'signedOut', message: `The ${this.runtime.displayName} sign-in page stopped unexpectedly. Try again.` }
    this.publishAccountSnapshot()
    this.mutationCoordinator.release(this.config.owner)
  }

  async scan() {
    await this.ensureSignedIn()
    this.state = 'scanning'
    this.resetTask()
    this.videos = []
    this.replacementVideos = []
    this.nextCursor = '0'
    this.hasMore = false
    this.isRefreshingCompletedList = false
    this.completionRefreshError = undefined
    this.message = `Loading the first ${this.config.pageSize} ${this.config.itemPluralLabel}.`
    this.publishSnapshot()

    try {
      await this.loadNextPage()
      this.state = 'ready'
      this.message = this.videos.length
        ? `Loaded ${this.videos.length} ${this.config.itemPluralLabel}.${this.hasMore ? ' Scroll down to load more.' : ''}`
        : this.config.emptyMessage
    } catch (error) {
      // A read failure is retryable and must not masquerade as a paused mutation task.
      this.state = 'idle'
      this.message = this.errorMessage(error)
    }

    this.publishSnapshot()
  }

  async loadMore() {
    if (
      (!this.hasMore && !this.replacementVideos.length)
      || this.isLoadingMore
      || this.isRefreshingCompletedList
      || !['ready', 'completed', 'stopped'].includes(this.state)
    ) return
    const previousState = this.state
    try {
      await this.ensureSignedIn()
      if (!this.appendReplacementVideos(this.config.pageSize)) await this.loadNextPage()
      this.message = `Loaded ${this.videos.length} ${this.config.itemPluralLabel}.${this.hasMore ? ' Scroll down to load more.' : ''}`
    } catch (error) {
      this.state = previousState
      this.message = this.errorMessage(error)
    }
    this.publishSnapshot()
  }

  async refreshCompletedList() {
    if (
      this.state !== 'completed'
      || !this.taskMode
      || this.taskMode === 'selected'
      || this.isRefreshingCompletedList
      || this.isRunning
    ) return
    await this.refreshCompletedAutomaticList()
  }

  start(selectedIds: string[]) {
    if (!selectedIds.length) throw new Error('Select at least one video before starting.')
    if (this.isRunning) return

    const selected = new Set(selectedIds)
    const knownIds = new Set(this.videos.map((video) => video.id))
    if (selectedIds.some((id) => !knownIds.has(id))) throw new Error('The selection is no longer available. Scan again.')
    this.mutationCoordinator.acquire(this.config.owner)

    this.taskMode = 'selected'
    this.taskIds = selected
    this.taskProcessedIds = new Set()
    this.taskCompleted = 0
    this.taskTotal = selectedIds.length
    for (const video of this.videos) {
      if (selected.has(video.id) && video.status !== 'completed') video.status = 'pending'
    }
    this.state = 'running'
    this.message = `Removing ${this.config.itemPluralLabel} through the ${this.runtime.displayName} web API.`
    this.publishSnapshot(selected)
    void this.processQueue(selected)
  }

  async startAll(limit?: number) {
    if (this.isRunning) return
    await this.ensureSignedIn()

    const pendingCount = this.videos.filter((video) => video.status !== 'completed').length
    const plan = createAutomaticRemovalPlan(limit, this.accountItemCount, pendingCount, this.config.itemPluralLabel)
    this.mutationCoordinator.acquire(this.config.owner)
    this.taskMode = plan.mode
    this.taskIds = new Set()
    this.replacementVideos = []
    this.completionRefreshError = undefined
    this.taskProcessedIds = new Set(this.videos.filter((video) => video.status === 'completed').map((video) => video.id))
    this.taskCompleted = 0
    this.taskTotal = plan.total
    for (const video of this.videos) {
      if (video.status !== 'completed') video.status = 'pending'
    }
    this.capAutomaticPendingRows()
    this.state = 'running'
    this.message = plan.mode === 'all'
      ? `Removing every ${this.config.itemLabel} and loading new batches until none remain.`
      : `Removing up to ${plan.total} ${this.config.itemPluralLabel}.`
    this.publishSnapshot()
    void this.processAutomaticRemoval()
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
      ? `Continuing removal of every ${this.config.itemLabel}.`
      : this.taskMode === 'limited'
        ? `Continuing removal of up to ${this.taskTotal} ${this.config.itemPluralLabel}.`
        : `Continuing removal of the selected ${this.config.itemPluralLabel}.`
    this.publishSnapshot(this.taskMode === 'selected' ? this.taskIds : undefined)
    // An in-flight worker observes the restored running state before sending its next request.
    if (this.isRunning) return
    if (this.taskMode === 'selected') void this.processQueue(this.taskIds)
    else void this.processAutomaticRemoval()
  }

  stop() {
    if (!['running', 'paused'].includes(this.state)) return
    this.automaticPrefetchGeneration += 1
    this.automaticPrefetch = undefined
    this.state = 'stopped'
    this.currentVideoId = undefined
    this.message = this.taskMode === 'selected'
      ? 'Task stopped. Unprocessed videos remain selected.'
      : `Automatic removal stopped. ${this.config.itemPluralLabel[0].toUpperCase()}${this.config.itemPluralLabel.slice(1)} remain.`
    this.publishSnapshot(this.taskMode === 'selected' ? this.taskIds : undefined)
    if (!this.isRunning) this.mutationCoordinator.release(this.config.owner)
  }

  async signOut() {
    this.stop()
    this.mutationCoordinator.release(this.config.owner)
    this.hideLogin()
    this.setLoginSnapshot({ state: 'idle' })
    await this.client.clearSession()
    this.account = { state: 'signedOut' }
    this.id = undefined
    this.nextCursor = '0'
    this.hasMore = false
    this.isRefreshingCompletedList = false
    this.completionRefreshError = undefined
    this.publishAccountSnapshot()
    this.state = 'idle'
    this.resetTask()
    this.videos = []
    this.message = `Signed out from ${this.runtime.displayName} on this device.`
    this.publishSnapshot()
  }

  resetForSignOut() {
    this.stop()
    this.mutationCoordinator.release(this.config.owner)
    this.state = 'idle'
    this.videos = []
    this.nextCursor = '0'
    this.hasMore = false
    this.isRefreshingCompletedList = false
    this.resetTask()
    this.message = `Signed out from ${this.runtime.displayName} on this device.`
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
          await this.removeVideo(video.id)
          video.status = 'completed'
          this.taskCompleted += 1
          this.decrementAccountItemCount()
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
        this.mutationCoordinator.release(this.config.owner)
        this.publishSnapshot(selectedIds)
      }
    } catch (error) {
      this.state = 'paused'
      this.message = this.errorMessage(error)
      this.publishSnapshot(selectedIds)
    } finally {
      this.isRunning = false
      if (this.state === 'stopped') this.mutationCoordinator.release(this.config.owner)
    }
  }

  private async processAutomaticRemoval() {
    this.isRunning = true
    try {
      await this.ensureSignedIn()
      while (this.state === 'running') {
        if (this.taskMode && this.taskMode !== 'selected' && hasReachedAutomaticTarget(this.taskMode, this.taskCompleted, this.taskTotal)) {
          await this.completeAutomaticTask(false)
          return
        }

        const pendingVideos = this.videos.filter((video) => video.status !== 'completed')
        if (!pendingVideos.length) {
          await this.refillAutomaticQueue()
          if (this.state !== 'running') return
          if (!this.videos.some((video) => video.status !== 'completed')) {
            await this.completeAutomaticTask(true)
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
            await this.removeVideo(video.id)
            video.status = 'completed'
            this.taskProcessedIds.add(video.id)
            this.taskCompleted += 1
            this.decrementAccountItemCount()
          } catch (error) {
            video.status = 'failed'
            this.state = 'paused'
            this.message = this.errorMessage(error)
            this.publishSnapshot()
            return
          }

          this.currentVideoId = undefined
          this.publishSnapshot()
          this.requestAutomaticPrefetch()
          if (this.taskMode && this.taskMode !== 'selected' && hasReachedAutomaticTarget(this.taskMode, this.taskCompleted, this.taskTotal)) {
            await this.completeAutomaticTask(false)
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
      if (this.state === 'stopped') this.mutationCoordinator.release(this.config.owner)
    }
  }

  private async loadNextAutomaticBatch() {
    this.message = `Loading the next batch of ${this.config.itemPluralLabel}.`

    // Start at the first page after each mutation because later videos shift forward as likes are removed.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      this.videos = []
      this.nextCursor = '0'
      this.hasMore = true
      do {
        await this.loadNextPage()
        this.videos = this.videos.filter((video) => !this.taskProcessedIds.has(video.id))
      } while (this.state === 'running' && !this.videos.length && this.hasMore)

      this.capAutomaticPendingRows()

      if (this.videos.length || !this.accountItemCount || this.state !== 'running') {
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

    throw new Error(`${this.runtime.displayName} still reports ${this.config.itemPluralLabel} but did not return a new batch. Continue to retry.`)
  }

  private async refillAutomaticQueue() {
    this.appendAutomaticReplacementVideos()
    if (this.videos.some((video) => video.status !== 'completed')) return

    await this.waitForAutomaticPrefetch()
    this.appendAutomaticReplacementVideos()
    if (this.videos.some((video) => video.status !== 'completed')) return

    await this.loadNextAutomaticBatch()
  }

  private requestAutomaticPrefetch() {
    if (
      this.automaticPrefetch
      || this.state !== 'running'
      || !this.taskMode
      || this.taskMode === 'selected'
      || !this.hasMore
    ) return

    const pendingCount = this.videos.filter((video) => video.status !== 'completed').length
    const remaining = remainingAutomaticTarget(this.taskMode, this.taskCompleted, this.taskTotal)
    if (pendingCount > this.runtime.videoPrefetchThreshold || remaining <= pendingCount) return

    const generation = this.automaticPrefetchGeneration
    const prefetch = this.prefetchAutomaticPage(generation)
      .catch(() => {
        // The foreground loader retries if the active queue drains before the next page arrives.
      })
    this.automaticPrefetch = prefetch
    void prefetch.finally(() => {
      if (this.automaticPrefetch === prefetch) this.automaticPrefetch = undefined
    })
  }

  private async waitForAutomaticPrefetch() {
    if (!this.automaticPrefetch) return
    try {
      await this.automaticPrefetch
    } catch {
      // Prefetch is opportunistic. The foreground loader performs the recoverable retry.
    }
  }

  private async prefetchAutomaticPage(generation: number) {
    const page = await this.loadFirstPage()
    if (generation !== this.automaticPrefetchGeneration) return
    this.hasMore = page.hasMore
    this.bufferReplacementVideos(page.videos)
    if (this.state === 'running') {
      this.appendAutomaticReplacementVideos()
      this.publishSnapshot()
    }
  }

  private appendAutomaticReplacementVideos() {
    if (!this.taskMode || this.taskMode === 'selected') return 0
    const pendingCount = this.videos.filter((video) => video.status !== 'completed').length
    const desiredCount = Math.min(
      this.config.pageSize,
      remainingAutomaticTarget(this.taskMode, this.taskCompleted, this.taskTotal),
    )
    return this.appendReplacementVideos(Math.max(0, desiredCount - pendingCount))
  }

  private capAutomaticPendingRows() {
    if (!this.taskMode || this.taskMode === 'selected') return
    const desiredCount = Math.min(
      this.config.pageSize,
      remainingAutomaticTarget(this.taskMode, this.taskCompleted, this.taskTotal),
    )
    let keptPending = 0
    const retained: VideoItem[] = []
    const overflow: VideoItem[] = []
    for (const video of this.videos) {
      if (video.status === 'completed' || keptPending < desiredCount) {
        retained.push(video)
        if (video.status !== 'completed') keptPending += 1
      } else {
        overflow.push(video)
      }
    }
    this.videos = retained
    this.bufferReplacementVideos(overflow)
  }

  private async completeAutomaticTask(exhausted: boolean) {
    const mode = this.taskMode
    this.state = 'completed'
    this.currentVideoId = undefined
    if (mode === 'limited') {
      if (exhausted && this.taskTotal !== null && this.taskCompleted < this.taskTotal) this.taskTotal = this.taskCompleted
      this.message = `Removed ${this.taskCompleted} ${this.config.itemPluralLabel}.`
    } else {
      this.hasMore = false
      this.message = `All ${this.config.itemPluralLabel} have been removed.`
    }
    this.videos = []
    this.mutationCoordinator.release(this.config.owner)
    this.publishSnapshot()
    await this.waitForAutomaticPrefetch()
    await this.refreshCompletedAutomaticList()
  }

  private async refreshCompletedAutomaticList() {
    this.isRefreshingCompletedList = true
    this.completionRefreshError = undefined
    this.videos = []
    this.nextCursor = '0'
    this.hasMore = false
    this.publishSnapshot()

    try {
      await this.ensureSignedIn()
      const mode = this.taskMode
      if (mode === 'limited') this.appendReplacementVideos(this.config.pageSize)

      // All scopes deliberately verify the empty result; limited scopes only request when the cache is short.
      if (mode === 'all' || this.videos.length < this.config.pageSize) {
        const page = await this.loadFirstPage()
        this.hasMore = page.hasMore
        this.nextCursor = page.nextCursor ?? '0'
        this.bufferReplacementVideos(page.videos)
        this.appendReplacementVideos(this.config.pageSize - this.videos.length)
      }

      this.message = mode === 'all'
        ? `All ${this.config.itemPluralLabel} have been removed.`
        : `Removed ${this.taskCompleted} ${this.config.itemPluralLabel}.`
    } catch (error) {
      this.completionRefreshError = this.errorMessage(error)
    } finally {
      this.isRefreshingCompletedList = false
      this.publishSnapshot()
    }
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

  private bufferReplacementVideos(videos: VideoItem[]) {
    const knownIds = new Set([
      ...this.videos.map((video) => video.id),
      ...this.replacementVideos.map((video) => video.id),
    ])
    for (const video of videos) {
      if (this.taskProcessedIds.has(video.id) || knownIds.has(video.id)) continue
      this.replacementVideos.push({ ...video, status: 'pending' })
      knownIds.add(video.id)
    }
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
    this.automaticPrefetchGeneration += 1
    this.automaticPrefetch = undefined
    this.taskMode = undefined
    this.taskIds = new Set()
    this.taskProcessedIds = new Set()
    this.replacementVideos = []
    this.completionRefreshError = undefined
    this.taskCompleted = 0
    this.taskTotal = 0
  }

  private async ensureSignedIn() {
    if (this.account.state !== 'signedIn') await this.refreshAccount()
    if (this.account.state !== 'signedIn') throw new Error(`Scan the QR code to sign in before scanning ${this.config.itemPluralLabel}.`)
  }

  private async refreshAccount() {
    this.account = { state: 'checking' }
    this.publishAccountSnapshot()
    try {
      const user = await this.client.getCurrentUser()
      this.client.flushSession()
      this.id = user.id
      this.account = {
        state: 'signedIn',
        name: user.name,
        avatar: user.avatar,
        likedVideosCount: user.likedVideosCount,
        followingCount: user.followingCount,
        collectedVideosCount: user.collectedVideosCount,
      }
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
  }

  private async pollLogin() {
    if (!this.loginVisible || this.loginPollPending) return
    this.loginPollPending = true
    try {
      const surface = await this.readLoginSurface()
      if (surface.state === 'ready') {
        this.setLoginSnapshot({ state: 'ready', qrCode: surface.qrCode })
      } else if (surface.state === 'verification') {
        if (this.login.state === 'verification') return
        const signedIn = await this.pollLoginAccount()
        if (!signedIn && this.loginVisible) this.setLoginSnapshot({ state: 'verification' })
      } else {
        this.setLoginSnapshot({ state: 'loading' })
      }
    } catch (error) {
      this.setLoginSnapshot({ state: 'error', message: this.errorMessage(error) })
    } finally {
      this.loginPollPending = false
    }
  }

  private async pollLoginAccount(): Promise<boolean> {
    if (!this.loginVisible) return false
    // Share the in-flight profile check so surface detection waits for the same login verdict.
    if (this.loginAccountProbe) return this.loginAccountProbe

    const probe = (async () => {
      try {
        const user = await this.client.getCurrentUser()
        this.client.flushSession()
        this.id = user.id
        this.account = {
          state: 'signedIn',
          name: user.name,
          avatar: user.avatar,
          likedVideosCount: user.likedVideosCount,
          followingCount: user.followingCount,
          collectedVideosCount: user.collectedVideosCount,
        }
        this.publishAccountSnapshot()
        this.hideLogin()
        this.setLoginSnapshot({ state: 'idle' })
        return true
      } catch {
        // A failed profile probe is expected until QR authorization completes.
        return false
      }
    })()
    this.loginAccountProbe = probe
    try {
      return await probe
    } finally {
      if (this.loginAccountProbe === probe) this.loginAccountProbe = undefined
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
      if (!this.id) this.id = (await this.client.getCurrentUser()).id
      const cursor = this.nextCursor
      const page = await this.loadVideos(this.id, cursor, this.config.pageSize)
      const found = new Map(this.videos.map((video) => [video.id, video]))
      for (const video of page.videos) found.set(video.id, video)
      this.videos = [...found.values()]
      this.hasMore = page.hasMore
      if (page.nextCursor) this.nextCursor = page.nextCursor
    } finally {
      this.isLoadingMore = false
    }
  }

  private async loadFirstPage() {
    if (!this.id) this.id = (await this.client.getCurrentUser()).id
    return this.loadVideos(this.id, '0', this.config.pageSize)
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
      isRefreshingCompletedList: this.isRefreshingCompletedList,
      completionRefreshError: this.completionRefreshError,
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
