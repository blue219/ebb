import type {
  AccountSnapshot,
  FollowingAccount,
  FollowingTaskSnapshot,
  TaskCounts,
  TaskMode,
  TaskState,
} from '../../../shared/platforms/contracts.js'
import {
  DOUYIN_RUNTIME_CONFIG,
  type PlatformClient,
  type PlatformRuntimeConfig,
} from './client.js'
import { PlatformMutationCoordinator } from './mutation-coordinator.js'
import {
  createAutomaticRemovalPlan,
  hasReachedAutomaticTarget,
  remainingAutomaticTarget,
} from '../removal-policy.js'

export interface PlatformAccountContext {
  getSnapshot: () => AccountSnapshot
  requireSignedInUserId: () => Promise<string>
  decrementFollowingCount: () => void
}

type StatusPublisher = (snapshot: FollowingTaskSnapshot) => void
type AutomaticMode = Exclude<TaskMode, 'selected'>

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

export class PlatformFollowingTaskService {
  private state: TaskState = 'idle'
  private accounts: FollowingAccount[] = []
  private currentAccountId?: string
  private nextCursor = '0'
  private hasMore = false
  private isLoadingMore = false
  private isRefreshingCompletedList = false
  private completionRefreshError?: string
  private message?: string
  private isRunning = false
  private taskMode?: TaskMode
  private taskIds = new Set<string>()
  private taskProcessedIds = new Set<string>()
  private replacementAccounts: FollowingAccount[] = []
  private automaticPrefetch?: Promise<void>
  private automaticPrefetchGeneration = 0
  private taskCompleted = 0
  private taskTotal: number | null = 0
  private readonly client: PlatformClient
  private readonly accountContext: PlatformAccountContext
  private readonly mutationCoordinator: PlatformMutationCoordinator
  private readonly publish: StatusPublisher
  private readonly wait: (milliseconds: number) => Promise<void>
  private readonly runtime: PlatformRuntimeConfig

  constructor(
    client: PlatformClient,
    accountContext: PlatformAccountContext,
    mutationCoordinator: PlatformMutationCoordinator,
    publish: StatusPublisher,
    wait: (milliseconds: number) => Promise<void> = sleep,
    runtime: PlatformRuntimeConfig = DOUYIN_RUNTIME_CONFIG,
  ) {
    this.client = client
    this.accountContext = accountContext
    this.mutationCoordinator = mutationCoordinator
    this.publish = publish
    this.wait = wait
    this.runtime = runtime
  }

  private get pageSize() {
    return this.runtime.followingPageSize
  }

  private get owner() {
    return `${this.runtime.id}:following` as const
  }

  getSnapshot() {
    return this.createSnapshot()
  }

  async scan() {
    await this.accountContext.requireSignedInUserId()
    this.state = 'scanning'
    this.resetTask()
    this.accounts = []
    this.nextCursor = '0'
    this.hasMore = false
    this.isRefreshingCompletedList = false
    this.completionRefreshError = undefined
    this.message = `Loading the first ${this.pageSize} following accounts.`
    this.publishSnapshot()

    try {
      await this.loadNextPage()
      this.state = 'ready'
      this.message = this.accounts.length
        ? `Loaded ${this.accounts.length} following accounts.${this.hasMore ? ' Scroll down to load more.' : ''}`
        : 'No following accounts were returned.'
    } catch (error) {
      // A read failure is retryable and must not masquerade as a paused mutation task.
      this.state = 'idle'
      this.message = this.errorMessage(error)
    }
    this.publishSnapshot()
  }

  async loadMore() {
    if (
      (!this.hasMore && !this.replacementAccounts.length)
      || this.isLoadingMore
      || this.isRefreshingCompletedList
      || !['ready', 'completed', 'stopped'].includes(this.state)
    ) return
    const previousState = this.state
    try {
      await this.accountContext.requireSignedInUserId()
      if (!this.appendReplacementAccounts(this.pageSize)) await this.loadNextPage()
      this.message = `Loaded ${this.accounts.length} following accounts.${this.hasMore ? ' Scroll down to load more.' : ''}`
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
    if (!selectedIds.length) throw new Error('Select at least one account before starting.')
    if (this.isRunning) return
    const selected = new Set(selectedIds)
    const knownIds = new Set(this.accounts.map((item) => item.id))
    if (selectedIds.some((id) => !knownIds.has(id))) {
      throw new Error('The selection is no longer available. Scan again.')
    }
    this.mutationCoordinator.acquire(this.owner)
    this.taskMode = 'selected'
    this.taskIds = selected
    this.taskProcessedIds = new Set()
    this.taskCompleted = 0
    this.taskTotal = selectedIds.length
    for (const item of this.accounts) {
      if (selected.has(item.id) && item.status !== 'completed') item.status = 'pending'
    }
    this.state = 'running'
    this.message = `Unfollowing selected accounts through the ${this.runtime.displayName} web API.`
    this.publishSnapshot(selected)
    void this.processSelected(selected)
  }

  async startAll(limit?: number) {
    if (this.isRunning) return
    await this.accountContext.requireSignedInUserId()
    const pendingCount = this.accounts.filter((item) => item.status !== 'completed').length
    const plan = createAutomaticRemovalPlan(
      limit,
      this.accountContext.getSnapshot().followingCount,
      pendingCount,
      'following accounts',
    )
    const mode: AutomaticMode = plan.mode
    const total = plan.total

    this.mutationCoordinator.acquire(this.owner)
    this.taskMode = mode
    this.taskIds = new Set()
    this.replacementAccounts = []
    this.completionRefreshError = undefined
    this.taskProcessedIds = new Set(this.accounts.filter((item) => item.status === 'completed').map((item) => item.id))
    this.taskCompleted = 0
    this.taskTotal = total
    for (const item of this.accounts) {
      if (item.status !== 'completed') item.status = 'pending'
    }
    this.capAutomaticPendingRows()
    this.state = 'running'
    this.message = mode === 'all'
      ? 'Unfollowing every account and loading new batches until none remain.'
      : `Unfollowing up to ${total} accounts.`
    this.publishSnapshot()
    void this.processAutomatic()
  }

  pause() {
    if (this.state !== 'running') return
    this.state = 'paused'
    this.message = 'Paused by you. No further API requests will be sent until you continue.'
    this.publishSnapshot(this.taskMode === 'selected' ? this.taskIds : undefined)
  }

  resume(_selectedIds: string[]) {
    if (this.state !== 'paused' || !this.taskMode) return
    this.mutationCoordinator.acquire(this.owner)
    if (this.taskMode === 'selected') {
      const knownIds = new Set(this.accounts.map((item) => item.id))
      if (!this.taskIds.size || [...this.taskIds].some((id) => !knownIds.has(id))) {
        throw new Error('The selection is no longer available. Scan again.')
      }
      for (const item of this.accounts) {
        if (this.taskIds.has(item.id) && item.status === 'failed') item.status = 'pending'
      }
    } else {
      for (const item of this.accounts) {
        if (item.status === 'failed') item.status = 'pending'
      }
    }
    this.state = 'running'
    this.message = this.taskMode === 'all'
      ? 'Continuing removal of every following account.'
      : this.taskMode === 'limited'
        ? `Continuing removal of up to ${this.taskTotal} following accounts.`
        : 'Continuing removal of the selected following accounts.'
    this.publishSnapshot(this.taskMode === 'selected' ? this.taskIds : undefined)
    if (this.isRunning) return
    if (this.taskMode === 'selected') void this.processSelected(this.taskIds)
    else void this.processAutomatic()
  }

  stop() {
    if (!['running', 'paused'].includes(this.state)) return
    this.automaticPrefetchGeneration += 1
    this.automaticPrefetch = undefined
    this.state = 'stopped'
    this.currentAccountId = undefined
    this.message = this.taskMode === 'selected'
      ? 'Task stopped. Unprocessed accounts remain selected.'
      : 'Automatic unfollow stopped. Following accounts remain.'
    this.publishSnapshot(this.taskMode === 'selected' ? this.taskIds : undefined)
    if (!this.isRunning) this.mutationCoordinator.release(this.owner)
  }

  resetForSignOut() {
    this.stop()
    this.mutationCoordinator.release(this.owner)
    this.state = 'idle'
    this.accounts = []
    this.nextCursor = '0'
    this.hasMore = false
    this.isRefreshingCompletedList = false
    this.resetTask()
    this.message = `Signed out from ${this.runtime.displayName} on this device.`
    this.publishSnapshot()
  }

  handleWorkspaceCrash() {
    this.state = 'stopped'
    this.currentAccountId = undefined
    this.message = `The ${this.runtime.displayName} workspace stopped unexpectedly.`
    this.mutationCoordinator.release(this.owner)
    this.publishSnapshot(this.taskMode === 'selected' ? this.taskIds : undefined)
  }

  dispose() {
    this.mutationCoordinator.release(this.owner)
  }

  private async processSelected(selectedIds: Set<string>) {
    this.isRunning = true
    try {
      await this.accountContext.requireSignedInUserId()
      for (const item of this.accounts) {
        if (!selectedIds.has(item.id) || item.status === 'completed') continue
        if (this.state !== 'running') return
        this.currentAccountId = item.id
        item.status = 'processing'
        this.publishSnapshot(selectedIds)
        try {
          await this.client.unfollow(item.id)
          item.status = 'completed'
          this.taskCompleted += 1
          this.accountContext.decrementFollowingCount()
        } catch (error) {
          item.status = 'failed'
          this.state = 'paused'
          this.message = this.errorMessage(error)
          this.publishSnapshot(selectedIds)
          return
        }
        this.currentAccountId = undefined
        this.publishSnapshot(selectedIds)
        try {
          await this.loadReplacementAccount()
        } catch {
          // A replacement fetch must not turn a successful unfollow into a failed task item.
        }
        this.publishSnapshot(selectedIds)
        await this.wait(180 + Math.round(Math.random() * 140))
      }
      if (this.state === 'running') {
        this.state = 'completed'
        this.message = 'The selected following accounts have been processed.'
        this.mutationCoordinator.release(this.owner)
        this.publishSnapshot(selectedIds)
      }
    } catch (error) {
      this.state = 'paused'
      this.message = this.errorMessage(error)
      this.publishSnapshot(selectedIds)
    } finally {
      this.isRunning = false
      if (this.state === 'stopped') this.mutationCoordinator.release(this.owner)
    }
  }

  private async processAutomatic() {
    this.isRunning = true
    try {
      await this.accountContext.requireSignedInUserId()
      while (this.state === 'running') {
        if (this.reachedAutomaticTarget()) {
          await this.completeAutomatic(false)
          return
        }
        const pending = this.accounts.filter((item) => item.status !== 'completed')
        if (!pending.length) {
          await this.refillAutomaticQueue()
          if (this.state !== 'running') return
          if (!this.accounts.some((item) => item.status !== 'completed')) {
            await this.completeAutomatic(true)
            return
          }
          continue
        }
        for (const item of pending) {
          if (this.state !== 'running') return
          if (this.reachedAutomaticTarget()) {
            await this.completeAutomatic(false)
            return
          }
          this.currentAccountId = item.id
          item.status = 'processing'
          this.publishSnapshot()
          try {
            await this.client.unfollow(item.id)
            item.status = 'completed'
            this.taskProcessedIds.add(item.id)
            this.taskCompleted += 1
            if (this.taskMode === 'all' && this.taskTotal !== null) {
              this.taskTotal = Math.max(this.taskTotal, this.taskCompleted)
            }
            this.accountContext.decrementFollowingCount()
          } catch (error) {
            item.status = 'failed'
            this.state = 'paused'
            this.message = this.errorMessage(error)
            this.publishSnapshot()
            return
          }
          this.currentAccountId = undefined
          this.publishSnapshot()
          this.requestAutomaticPrefetch()
          if (this.reachedAutomaticTarget()) {
            await this.completeAutomatic(false)
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
      if (this.state === 'stopped') this.mutationCoordinator.release(this.owner)
    }
  }

  private reachedAutomaticTarget() {
    return this.taskMode !== undefined
      && this.taskMode !== 'selected'
      && hasReachedAutomaticTarget(this.taskMode, this.taskCompleted, this.taskTotal)
  }

  private remainingAutomaticTarget() {
    return this.taskMode && this.taskMode !== 'selected'
      ? remainingAutomaticTarget(this.taskMode, this.taskCompleted, this.taskTotal)
      : Number.POSITIVE_INFINITY
  }

  private async refillAutomaticQueue() {
    this.appendAutomaticReplacementAccounts()
    if (this.accounts.some((item) => item.status !== 'completed')) return
    await this.waitForAutomaticPrefetch()
    this.appendAutomaticReplacementAccounts()
    if (this.accounts.some((item) => item.status !== 'completed')) return
    await this.loadNextAutomaticBatch()
  }

  private async loadNextAutomaticBatch() {
    this.message = 'Loading the next batch of following accounts.'
    for (let attempt = 0; attempt < 3; attempt += 1) {
      this.accounts = []
      this.nextCursor = '0'
      this.hasMore = true
      do {
        await this.loadNextPage()
        this.accounts = this.accounts.filter((item) => !this.taskProcessedIds.has(item.id))
      } while (this.state === 'running' && !this.accounts.length && this.hasMore)
      this.capAutomaticPendingRows()
      const reportedCount = this.accountContext.getSnapshot().followingCount
      if (this.accounts.length || !reportedCount || this.state !== 'running') {
        this.publishSnapshot()
        return
      }
      await this.wait(600 * (attempt + 1))
    }
    if (this.taskMode === 'limited') {
      this.accounts = []
      this.hasMore = false
      this.publishSnapshot()
      return
    }
    throw new Error(`${this.runtime.displayName} still reports following accounts but did not return a new batch. Continue to retry.`)
  }

  private requestAutomaticPrefetch() {
    if (
      this.automaticPrefetch
      || this.state !== 'running'
      || !this.taskMode
      || this.taskMode === 'selected'
      || !this.hasMore
    ) return
    const pendingCount = this.accounts.filter((item) => item.status !== 'completed').length
    const remaining = this.remainingAutomaticTarget()
    if (pendingCount > this.runtime.followingPrefetchThreshold || remaining <= pendingCount) return
    const generation = this.automaticPrefetchGeneration
    const prefetch = this.prefetchAutomaticPage(generation).catch(() => {
      // The foreground loader retries if the active queue drains before the next page arrives.
    })
    this.automaticPrefetch = prefetch
    void prefetch.finally(() => {
      if (this.automaticPrefetch === prefetch) this.automaticPrefetch = undefined
    })
  }

  private async prefetchAutomaticPage(generation: number) {
    const page = await this.loadFirstPage()
    if (generation !== this.automaticPrefetchGeneration) return
    this.hasMore = page.hasMore
    this.bufferReplacementAccounts(page.accounts)
    if (this.state === 'running') {
      this.appendAutomaticReplacementAccounts()
      this.publishSnapshot()
    }
  }

  private async waitForAutomaticPrefetch() {
    if (!this.automaticPrefetch) return
    try {
      await this.automaticPrefetch
    } catch {
      // Prefetch is opportunistic. The foreground loader performs the recoverable retry.
    }
  }

  private appendAutomaticReplacementAccounts() {
    const pendingCount = this.accounts.filter((item) => item.status !== 'completed').length
    const desiredCount = Math.min(this.pageSize, this.remainingAutomaticTarget())
    return this.appendReplacementAccounts(Math.max(0, desiredCount - pendingCount))
  }

  private capAutomaticPendingRows() {
    if (!this.taskMode || this.taskMode === 'selected') return
    const desiredCount = Math.min(this.pageSize, this.remainingAutomaticTarget())
    let keptPending = 0
    const retained: FollowingAccount[] = []
    const overflow: FollowingAccount[] = []
    for (const item of this.accounts) {
      if (item.status === 'completed' || keptPending < desiredCount) {
        retained.push(item)
        if (item.status !== 'completed') keptPending += 1
      } else {
        overflow.push(item)
      }
    }
    this.accounts = retained
    this.bufferReplacementAccounts(overflow)
  }

  private async completeAutomatic(exhausted: boolean) {
    const mode = this.taskMode
    this.state = 'completed'
    this.currentAccountId = undefined
    if (mode === 'limited') {
      if (exhausted && this.taskTotal !== null && this.taskCompleted < this.taskTotal) this.taskTotal = this.taskCompleted
      this.message = `Unfollowed ${this.taskCompleted} accounts.`
    } else {
      this.hasMore = false
      if (this.taskTotal !== null) this.taskTotal = this.taskCompleted
      this.message = 'All following accounts have been unfollowed.'
    }
    this.accounts = []
    this.mutationCoordinator.release(this.owner)
    this.publishSnapshot()
    await this.waitForAutomaticPrefetch()
    await this.refreshCompletedAutomaticList()
  }

  private async refreshCompletedAutomaticList() {
    this.isRefreshingCompletedList = true
    this.completionRefreshError = undefined
    this.accounts = []
    this.nextCursor = '0'
    this.hasMore = false
    this.publishSnapshot()
    try {
      const mode = this.taskMode
      if (mode === 'limited') this.appendReplacementAccounts(this.pageSize)
      if (mode === 'all' || this.accounts.length < this.pageSize) {
        const page = await this.loadFirstPage()
        this.hasMore = page.hasMore
        this.nextCursor = page.nextCursor ?? '0'
        this.bufferReplacementAccounts(page.accounts)
        this.appendReplacementAccounts(this.pageSize - this.accounts.length)
      }
      this.message = mode === 'all'
        ? 'All following accounts have been unfollowed.'
        : `Unfollowed ${this.taskCompleted} accounts.`
    } catch (error) {
      this.completionRefreshError = this.errorMessage(error)
    } finally {
      this.isRefreshingCompletedList = false
      this.publishSnapshot()
    }
  }

  private appendReplacementAccounts(limit: number) {
    const knownIds = new Set(this.accounts.map((item) => item.id))
    let appended = 0
    while (this.replacementAccounts.length && appended < limit) {
      const item = this.replacementAccounts.shift()
      if (!item || knownIds.has(item.id)) continue
      this.accounts.push(item)
      knownIds.add(item.id)
      appended += 1
    }
    return appended
  }

  private bufferReplacementAccounts(accounts: FollowingAccount[]) {
    const knownIds = new Set([
      ...this.accounts.map((item) => item.id),
      ...this.replacementAccounts.map((item) => item.id),
    ])
    for (const item of accounts) {
      if (this.taskProcessedIds.has(item.id) || knownIds.has(item.id)) continue
      this.replacementAccounts.push({ ...item, status: 'pending' })
      knownIds.add(item.id)
    }
  }

  private async loadReplacementAccount() {
    if (this.appendReplacementAccounts(1)) return
    while (this.hasMore) {
      const current = [...this.accounts]
      const currentIds = new Set(current.map((item) => item.id))
      await this.loadNextPage()
      const fetched = this.accounts.filter((item) => !currentIds.has(item.id))
      this.accounts = current
      this.replacementAccounts.push(...fetched)
      if (this.appendReplacementAccounts(1)) return
    }
  }

  private async loadNextPage() {
    if (this.isLoadingMore) return
    this.isLoadingMore = true
    this.publishSnapshot()
    try {
      const id = await this.accountContext.requireSignedInUserId()
      const cursor = this.nextCursor
      const page = await this.client.loadFollowing(id, cursor, this.pageSize)
      const found = new Map(this.accounts.map((item) => [item.id, item]))
      for (const item of page.accounts) found.set(item.id, item)
      this.accounts = [...found.values()]
      this.hasMore = page.hasMore
      if (page.nextCursor) this.nextCursor = page.nextCursor
    } finally {
      this.isLoadingMore = false
    }
  }

  private async loadFirstPage() {
    const id = await this.accountContext.requireSignedInUserId()
    return this.client.loadFollowing(id, '0', this.pageSize)
  }

  private resetTask() {
    this.automaticPrefetchGeneration += 1
    this.automaticPrefetch = undefined
    this.taskMode = undefined
    this.taskIds = new Set()
    this.taskProcessedIds = new Set()
    this.replacementAccounts = []
    this.completionRefreshError = undefined
    this.taskCompleted = 0
    this.taskTotal = 0
  }

  private createSnapshot(selectedIds = new Set<string>()): FollowingTaskSnapshot {
    let selected = 0
    let completed = 0
    let failed = 0
    for (const item of this.accounts) {
      if (selectedIds.has(item.id)) selected += 1
      if (item.status === 'completed') completed += 1
      else if (item.status === 'failed') failed += 1
    }
    const counts: TaskCounts = {
      loaded: this.accounts.length,
      selected,
      completed: this.taskMode ? this.taskCompleted : completed,
      failed,
    }
    return {
      state: this.state,
      mode: this.taskMode,
      accounts: [...this.accounts],
      counts,
      progress: { completed: this.taskCompleted, total: this.taskTotal },
      currentAccountId: this.currentAccountId,
      hasMore: this.hasMore || this.replacementAccounts.length > 0,
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
    return error instanceof Error ? error.message : 'An unexpected following task error occurred.'
  }
}
