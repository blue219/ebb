import { describe, expect, test, vi } from 'vitest'

import type {
  AccountSnapshot,
  DouyinVideo,
  LoginSnapshot,
  TaskSnapshot,
} from '../../../shared/platforms/douyin/contracts.ts'
import type {
  DouyinClient,
  DouyinCurrentUser,
  DouyinFavoritePage,
} from './client.ts'
import { DouyinTaskService } from './task-service.ts'
import { DouyinMutationCoordinator } from './mutation-coordinator.ts'

const video = (id: string): DouyinVideo => ({ id, title: `Video ${id}`, status: 'pending' })
const page = (ids: string[], nextCursor?: string, hasMore = false): DouyinFavoritePage => ({
  videos: ids.map(video),
  nextCursor,
  hasMore,
})

class MemoryDouyinClient implements DouyinClient {
  user: DouyinCurrentUser = { secUserId: 'account-1', name: 'Sky', likesCount: 8 }
  login: LoginSnapshot = { state: 'ready', qrCode: 'data:image/png;base64,aA==' }
  pages: Array<DouyinFavoritePage | Error> = []
  favoriteRequests: Array<{ cursor: string, count: number }> = []
  unlikeAttempts: string[] = []
  unlikeFailures = new Map<string, number>()
  beforeUnlike?: (videoId: string) => Promise<void>
  loginError?: Error
  currentUserError?: Error
  initialized = 0
  disposed = false
  cleared = false
  flushed = false
  refreshed = false
  private crashCallback = () => {}

  async initialize() { this.initialized += 1 }
  dispose() { this.disposed = true }
  async refreshLogin() { this.refreshed = true }
  async clearSession() { this.cleared = true }
  flushSession() { this.flushed = true }
  async getCurrentUser() {
    if (this.currentUserError) throw this.currentUserError
    return this.user
  }
  async readLoginSurface() {
    if (this.loginError) throw this.loginError
    return this.login
  }
  async loadFavorites(_secUserId: string, cursor: string, count: number) {
    this.favoriteRequests.push({ cursor, count })
    const response = this.pages.shift() ?? page([])
    if (response instanceof Error) throw response
    return response
  }
  async unlike(videoId: string) {
    this.unlikeAttempts.push(videoId)
    await this.beforeUnlike?.(videoId)
    const remainingFailures = this.unlikeFailures.get(videoId) ?? 0
    if (remainingFailures > 0) {
      this.unlikeFailures.set(videoId, remainingFailures - 1)
      throw new Error('Douyin API request was rejected: slow down')
    }
  }
  async loadFollowing() { return { accounts: [], hasMore: false } }
  async unfollow() {}
  onWorkspaceCrash(callback: () => void) {
    this.crashCallback = callback
    return () => { this.crashCallback = () => {} }
  }
  crash() { this.crashCallback() }
}

function createService(client = new MemoryDouyinClient(), coordinator = new DouyinMutationCoordinator()) {
  const taskSnapshots: TaskSnapshot[] = []
  const accountSnapshots: AccountSnapshot[] = []
  const loginSnapshots: LoginSnapshot[] = []
  const service = new DouyinTaskService(
    client,
    (snapshot) => taskSnapshots.push(snapshot),
    (snapshot) => accountSnapshots.push(snapshot),
    (snapshot) => loginSnapshots.push(snapshot),
    async () => {},
    coordinator,
  )
  return { accountSnapshots, client, coordinator, loginSnapshots, service, taskSnapshots }
}

async function expectTaskState(service: DouyinTaskService, state: TaskSnapshot['state']) {
  await vi.waitFor(() => expect(service.getTaskSnapshot().state).toBe(state))
}

describe('Douyin removal task module', () => {
  test('holds the shared mutation lock while running or paused and releases it when stopped', async () => {
    const { client, coordinator, service } = createService()
    client.pages.push(page(['1']))
    client.unlikeFailures.set('1', 1)
    await service.initialize()
    await service.scan()

    service.start(['1'])
    await expectTaskState(service, 'paused')
    expect(coordinator.currentOwner()).toBe('likes')
    expect(() => coordinator.acquire('following')).toThrow(/liked-video task is active/i)

    service.stop()
    expect(coordinator.currentOwner()).toBeUndefined()
  })

  test('initializes the account, scans pages, and deduplicates loaded videos', async () => {
    const { client, service } = createService()
    client.pages.push(page(['1', '2'], '10', true), page(['2', '3']))

    await service.initialize()
    await service.scan()
    expect(service.getAccountSnapshot()).toMatchObject({ state: 'signedIn', name: 'Sky', likesCount: 8 })
    expect(service.getTaskSnapshot()).toMatchObject({ state: 'ready', hasMore: true, counts: { loaded: 2 } })

    await service.loadMore()
    expect(service.getTaskSnapshot()).toMatchObject({ state: 'ready', hasMore: false, counts: { loaded: 3 } })
    expect(service.getTaskSnapshot().videos.map(({ id }) => id)).toEqual(['1', '2', '3'])
    expect(client.flushed).toBe(true)
  })

  test('removes only a frozen manual selection and reveals one replacement row', async () => {
    const { client, service, taskSnapshots } = createService()
    client.pages.push(page(['1', '2'], '10', true), page(['3', '4']))
    await service.initialize()
    await service.scan()

    service.start(['2'])
    await expectTaskState(service, 'completed')

    expect(client.unlikeAttempts).toEqual(['2'])
    expect(taskSnapshots.at(-1)).toMatchObject({
      mode: 'selected',
      progress: { completed: 1, total: 1 },
      counts: { loaded: 3, selected: 1, completed: 1, failed: 0 },
    })
    expect(service.getAccountSnapshot().likesCount).toBe(7)
    expect(service.getTaskSnapshot().videos.map(({ id }) => id)).toEqual(['1', '2', '3'])
  })

  test('rejects empty and stale manual selections', async () => {
    const { client, service } = createService()
    client.pages.push(page(['1']))
    await service.initialize()
    await service.scan()

    expect(() => service.start([])).toThrow(/Select at least one/)
    expect(() => service.start(['missing'])).toThrow(/no longer available/)
  })

  test('stops a limited task at its frozen target across batches', async () => {
    const { client, service } = createService()
    client.pages.push(page(['1', '2']), page(['3', '4']))
    await service.initialize()
    await service.scan()

    await service.startAll(3)
    await expectTaskState(service, 'completed')

    expect(client.unlikeAttempts).toEqual(['1', '2', '3'])
    expect(service.getTaskSnapshot()).toMatchObject({
      mode: 'limited',
      progress: { completed: 3, total: 3 },
    })
    expect(service.getAccountSnapshot().likesCount).toBe(5)
  })

  test('prefetches a 30-row first page at the low watermark without pausing removal', async () => {
    const { client, service } = createService()
    client.user.likesCount = 50
    const initialIds = Array.from({ length: 30 }, (_, index) => String(index + 1))
    const prefetchedIds = Array.from({ length: 30 }, (_, index) => String(index + 21))
    client.pages.push(page(initialIds, '30', true), page(prefetchedIds, '30', true))

    await service.initialize()
    await service.scan()
    client.beforeUnlike = async (id) => {
      if (id === '21') expect(client.favoriteRequests).toHaveLength(2)
    }

    await service.startAll(35)
    await expectTaskState(service, 'completed')

    expect(client.unlikeAttempts).toEqual(Array.from({ length: 35 }, (_, index) => String(index + 1)))
    expect(client.favoriteRequests.every((request) => request.count === 30)).toBe(true)
    expect(client.favoriteRequests[1]).toEqual({ cursor: '0', count: 30 })
    expect(service.getTaskSnapshot().videos.map((video) => video.id)).toEqual(Array.from({ length: 15 }, (_, index) => String(index + 36)))
  })

  test('keeps removing loaded rows when a background prefetch fails, then retries in the foreground', async () => {
    const { client, service } = createService()
    client.user.likesCount = 40
    client.pages.push(
      page(Array.from({ length: 30 }, (_, index) => String(index + 1)), '30', true),
      new Error('prefetch unavailable'),
      page(Array.from({ length: 10 }, (_, index) => String(index + 31))),
    )

    await service.initialize()
    await service.scan()
    await service.startAll(40)
    await expectTaskState(service, 'completed')

    expect(client.unlikeAttempts).toEqual(Array.from({ length: 40 }, (_, index) => String(index + 1)))
    expect(service.getTaskSnapshot().counts.failed).toBe(0)
  })

  test('keeps a completed task complete when refreshing its remaining table rows fails', async () => {
    const { client, service } = createService()
    client.pages.push(page(['1']), new Error('refresh unavailable'), page(['2']))

    await service.initialize()
    await service.scan()
    await service.startAll(1)
    await vi.waitFor(() => expect(service.getTaskSnapshot().completionRefreshError).toBe('refresh unavailable'))

    expect(service.getTaskSnapshot().state).toBe('completed')
    await service.refreshCompletedList()

    expect(service.getTaskSnapshot()).toMatchObject({
      state: 'completed',
      isRefreshingCompletedList: false,
      completionRefreshError: undefined,
    })
    expect(service.getTaskSnapshot().videos.map((video) => video.id)).toEqual(['2'])
  })

  test('completes an All scope only after the account is exhausted', async () => {
    const { client, service } = createService()
    client.user.likesCount = 2
    client.pages.push(page(['1', '2']), page([]))
    await service.initialize()
    await service.scan()

    await service.startAll()
    await expectTaskState(service, 'completed')

    expect(client.unlikeAttempts).toEqual(['1', '2'])
    expect(service.getTaskSnapshot()).toMatchObject({ mode: 'all', hasMore: false, progress: { completed: 2, total: 2 } })
    expect(service.getAccountSnapshot().likesCount).toBe(0)
    expect(client.favoriteRequests).toHaveLength(3)
  })

  test('shrinks a limited target when the account exhausts early', async () => {
    const { client, service } = createService()
    client.pages.push(page(['1']), page([]))
    await service.initialize()
    await service.scan()

    await service.startAll(3)
    await expectTaskState(service, 'completed')
    expect(service.getTaskSnapshot().progress).toEqual({ completed: 1, total: 1 })
    expect(client.unlikeAttempts).toEqual(['1'])
  })

  test('does not turn a successful unlike into failure when replacement loading fails', async () => {
    const { client, service } = createService()
    client.pages.push(page(['1'], '10', true), new Error('replacement unavailable'))
    await service.initialize()
    await service.scan()

    service.start(['1'])
    await expectTaskState(service, 'completed')
    expect(service.getTaskSnapshot().progress.completed).toBe(1)
    expect(service.getTaskSnapshot().counts.failed).toBe(0)
  })

  test('pauses scanning and pagination when loading fails', async () => {
    const { client, service } = createService()
    client.pages.push(new Error('first page unavailable'))
    await service.initialize()
    await service.scan()
    expect(service.getTaskSnapshot()).toMatchObject({ state: 'paused', message: 'first page unavailable' })

    client.pages.push(page(['1'], '10', true))
    await service.scan()
    client.pages.push(new Error('next page unavailable'))
    await service.loadMore()
    expect(service.getTaskSnapshot()).toMatchObject({ state: 'paused', message: 'next page unavailable' })
  })

  test('pauses All scope when a stale account count never yields another batch', async () => {
    const { client, service } = createService()
    client.user.likesCount = 4
    client.pages.push(page(['1']), page([]), page([]), page([]))
    await service.initialize()
    await service.scan()

    await service.startAll()
    await expectTaskState(service, 'paused')
    expect(service.getTaskSnapshot().message).toContain('still reports liked videos')
    expect(client.unlikeAttempts).toEqual(['1'])
  })

  test('pauses on a rejected mutation and resumes only unfinished work', async () => {
    const { client, service } = createService()
    client.pages.push(page(['1', '2']))
    client.unlikeFailures.set('1', 1)
    await service.initialize()
    await service.scan()

    service.start(['1', '2'])
    await expectTaskState(service, 'paused')
    expect(client.unlikeAttempts).toEqual(['1'])
    expect(service.getTaskSnapshot()).toMatchObject({ counts: { failed: 1 }, message: expect.stringContaining('slow down') })

    service.resume(['1', '2'])
    await expectTaskState(service, 'completed')
    expect(client.unlikeAttempts).toEqual(['1', '1', '2'])
    expect(service.getTaskSnapshot().progress.completed).toBe(2)
  })

  test('pause and stop wait for an in-flight mutation before preventing later requests', async () => {
    for (const action of ['pause', 'stop'] as const) {
      const { client, coordinator, service } = createService()
      client.pages.push(page(['1', '2']))
      let releaseUnlike = () => {}
      const unlikeBlocked = new Promise<void>((resolve) => { releaseUnlike = resolve })
      client.beforeUnlike = async (id) => { if (id === '1') await unlikeBlocked }
      await service.initialize()
      await service.scan()

      service.start(['1', '2'])
      await vi.waitFor(() => expect(client.unlikeAttempts).toEqual(['1']))
      service[action]()
      if (action === 'stop') expect(coordinator.currentOwner()).toBe('likes')
      releaseUnlike()
      await vi.waitFor(() => expect(service.getTaskSnapshot().progress.completed).toBe(1))

      expect(client.unlikeAttempts).toEqual(['1'])
      expect(service.getTaskSnapshot().state).toBe(action === 'pause' ? 'paused' : 'stopped')
      expect(service.getTaskSnapshot().progress.completed).toBe(1)
    }
  })

  test('sign out clears the session and resets all in-memory state', async () => {
    const { client, service } = createService()
    client.pages.push(page(['1']))
    await service.initialize()
    await service.scan()
    await service.signOut()

    expect(client.cleared).toBe(true)
    expect(service.getAccountSnapshot()).toEqual({ state: 'signedOut' })
    expect(service.getTaskSnapshot()).toMatchObject({ state: 'idle', counts: { loaded: 0 }, progress: { completed: 0, total: 0 } })
  })

  test('publishes login state and reports a crashed workspace', async () => {
    const { client, loginSnapshots, service } = createService()
    await service.initialize()
    await service.showLogin()
    await vi.waitFor(() => expect(loginSnapshots.at(-1)).toEqual(client.login))
    service.hideLogin()

    client.crash()
    expect(service.getAccountSnapshot()).toMatchObject({ state: 'signedOut', message: expect.stringContaining('stopped unexpectedly') })
    expect(service.getLoginSnapshot()).toMatchObject({ state: 'error' })
    service.dispose()
    expect(client.disposed).toBe(true)
  })

  test('publishes verification and login errors and can refresh the sign-in surface', async () => {
    const { client, loginSnapshots, service } = createService()
    client.currentUserError = new Error('not signed in')
    await service.initialize()
    client.login = { state: 'verification' }
    await service.showLogin()
    await vi.waitFor(() => expect(loginSnapshots.at(-1)).toEqual({ state: 'verification' }))

    client.loginError = new Error('QR unavailable')
    await service.refreshLogin()
    await vi.waitFor(() => expect(loginSnapshots.at(-1)).toEqual({ state: 'error', message: 'QR unavailable' }))
    expect(client.refreshed).toBe(true)
    service.hideLogin()
  })
})
