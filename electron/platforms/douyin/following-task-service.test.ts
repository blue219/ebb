import { describe, expect, test, vi } from 'vitest'

import type {
  AccountSnapshot,
  FollowingAccount,
  FollowingTaskSnapshot,
  LoginSnapshot,
} from '../../../shared/platforms/douyin/contracts.ts'
import type {
  DouyinClient,
  DouyinCurrentUser,
  DouyinFavoritePage,
  DouyinFollowingPage,
} from './client.ts'
import { DouyinFollowingTaskService, type DouyinAccountContext } from './following-task-service.ts'
import { DouyinMutationCoordinator } from './mutation-coordinator.ts'

const account = (id: string, relation: FollowingAccount['relation'] = 'following'): FollowingAccount => ({
  id: id,
  displayName: `Account ${id}`,
  username: `douyin-${id}`,
  relation,
  status: 'pending',
})

const followingPage = (ids: string[], nextCursor?: string, hasMore = false): DouyinFollowingPage => ({
  accounts: ids.map((id) => account(id)),
  nextCursor,
  hasMore,
})

class MemoryDouyinClient implements DouyinClient {
  user: DouyinCurrentUser = { id: 'self', name: 'Sky', followingCount: 4 }
  pages: Array<DouyinFollowingPage | Error> = []
  followingRequests: Array<{ cursor: string, count: number }> = []
  unfollowAttempts: string[] = []
  unfollowFailures = new Map<string, number>()
  beforeUnfollow?: (id: string) => Promise<void>

  async initialize() {}
  dispose() {}
  async refreshLogin() {}
  async clearSession() {}
  flushSession() {}
  async getCurrentUser() { return this.user }
  async readLoginSurface(): Promise<LoginSnapshot> { return { state: 'idle' } }
  async loadFavorites(): Promise<DouyinFavoritePage> { return { videos: [], hasMore: false } }
  async unlike() {}
  async loadFollowing(_id: string, cursor: string, count: number) {
    this.followingRequests.push({ cursor, count })
    const response = this.pages.shift() ?? followingPage([])
    if (response instanceof Error) throw response
    return response
  }
  async unfollow(id: string) {
    this.unfollowAttempts.push(id)
    await this.beforeUnfollow?.(id)
    const failures = this.unfollowFailures.get(id) ?? 0
    if (failures > 0) {
      this.unfollowFailures.set(id, failures - 1)
      throw new Error('Douyin API request was rejected: slow down')
    }
  }
  async loadCollections() { return { videos: [], hasMore: false } }
  async uncollect() {}
  onWorkspaceCrash() { return () => {} }
}

function createService(followingCount = 4) {
  const client = new MemoryDouyinClient()
  client.user.followingCount = followingCount
  const coordinator = new DouyinMutationCoordinator()
  let accountSnapshot: AccountSnapshot = {
    state: 'signedIn',
    name: 'Sky',
    followingCount: client.user.followingCount,
  }
  const accountContext: DouyinAccountContext = {
    getSnapshot: () => ({ ...accountSnapshot }),
    requireSignedInUserId: async () => client.user.id,
    decrementFollowingCount: () => {
      if (accountSnapshot.followingCount !== undefined && accountSnapshot.followingCount > 0) {
        accountSnapshot = { ...accountSnapshot, followingCount: accountSnapshot.followingCount - 1 }
      }
    },
  }
  const snapshots: FollowingTaskSnapshot[] = []
  const service = new DouyinFollowingTaskService(
    client,
    accountContext,
    coordinator,
    (snapshot) => snapshots.push(snapshot),
    async () => {},
  )
  return { accountContext, client, coordinator, service, snapshots }
}

async function expectState(service: DouyinFollowingTaskService, state: FollowingTaskSnapshot['state']) {
  await vi.waitFor(() => expect(service.getSnapshot().state).toBe(state))
}

describe('Douyin following task module', () => {
  test('loads 20-account pages and deduplicates stable IDs', async () => {
    const { client, service } = createService()
    client.pages.push(followingPage(['1', '2'], '10', true), followingPage(['2', '3']))

    await service.scan()
    await service.loadMore()

    expect(service.getSnapshot()).toMatchObject({ state: 'ready', counts: { loaded: 3 }, hasMore: false })
    expect(service.getSnapshot().accounts.map(({ id }) => id)).toEqual(['1', '2', '3'])
    expect(client.followingRequests).toEqual([{ cursor: '0', count: 20 }, { cursor: '10', count: 20 }])
  })

  test('unfollows a frozen manual selection and updates the shared account count', async () => {
    const { accountContext, client, coordinator, service } = createService()
    client.pages.push(followingPage(['1', '2']))
    await service.scan()

    service.start(['2'])
    await expectState(service, 'completed')

    expect(client.unfollowAttempts).toEqual(['2'])
    expect(service.getSnapshot()).toMatchObject({ mode: 'selected', progress: { completed: 1, total: 1 } })
    expect(accountContext.getSnapshot().followingCount).toBe(3)
    expect(coordinator.currentOwner()).toBeUndefined()
  })

  test('pauses on the first rejection, retains the lock, and retries only after continue', async () => {
    const { client, coordinator, service } = createService()
    client.pages.push(followingPage(['1', '2']))
    client.unfollowFailures.set('1', 1)
    await service.scan()

    service.start(['1', '2'])
    await expectState(service, 'paused')
    expect(client.unfollowAttempts).toEqual(['1'])
    expect(coordinator.currentOwner()).toBe('following')

    service.resume(['1', '2'])
    await expectState(service, 'completed')
    expect(client.unfollowAttempts).toEqual(['1', '1', '2'])
  })

  test('does not let resume replace the frozen manual selection', async () => {
    const { client, service } = createService()
    client.pages.push(followingPage(['1', '2', '3']))
    client.unfollowFailures.set('1', 1)
    await service.scan()

    service.start(['1', '2'])
    await expectState(service, 'paused')
    service.resume(['1', '3'])
    await expectState(service, 'completed')

    expect(client.unfollowAttempts).toEqual(['1', '1', '2'])
    expect(service.getSnapshot().progress).toEqual({ completed: 2, total: 2 })
  })

  test('keeps an All scope live until a first-page rescan is empty', async () => {
    const { client, service } = createService(2)
    client.pages.push(followingPage(['1', '2']), followingPage([]), followingPage([]))
    await service.scan()

    await service.startAll()
    await expectState(service, 'completed')

    expect(client.unfollowAttempts).toEqual(['1', '2'])
    expect(service.getSnapshot()).toMatchObject({ mode: 'all', progress: { completed: 2, total: 2 } })
    expect(client.followingRequests.every(({ cursor, count }) => cursor === '0' && count === 20)).toBe(true)
  })

  test('expands live All progress when a newly followed account appears during the task', async () => {
    const { client, service } = createService(1)
    client.pages.push(followingPage(['1']), followingPage(['2']), followingPage([]), followingPage([]))
    await service.scan()

    await service.startAll()
    await expectState(service, 'completed')

    expect(client.unfollowAttempts).toEqual(['1', '2'])
    expect(service.getSnapshot().progress).toEqual({ completed: 2, total: 2 })
  })

  test('prefetches a 20-account automatic page at five pending rows', async () => {
    const { client, service } = createService(40)
    client.pages.push(
      followingPage(Array.from({ length: 20 }, (_, index) => String(index + 1)), '20', true),
      followingPage(Array.from({ length: 20 }, (_, index) => String(index + 16)), '20', true),
      followingPage([]),
    )
    await service.scan()
    client.beforeUnfollow = async (id) => {
      if (id === '16') expect(client.followingRequests).toHaveLength(2)
    }

    await service.startAll(25)
    await expectState(service, 'completed')

    expect(client.unfollowAttempts).toEqual(Array.from({ length: 25 }, (_, index) => String(index + 1)))
    expect(client.followingRequests[1]).toEqual({ cursor: '0', count: 20 })
  })

  test('keeps a completed task complete when its remaining-list refresh fails', async () => {
    const { client, service } = createService(1)
    client.pages.push(followingPage(['1']), new Error('refresh unavailable'), followingPage(['2']))
    await service.scan()

    await service.startAll(1)
    await vi.waitFor(() => expect(service.getSnapshot().completionRefreshError).toBe('refresh unavailable'))
    expect(service.getSnapshot().state).toBe('completed')

    await service.refreshCompletedList()
    expect(service.getSnapshot()).toMatchObject({ state: 'completed', completionRefreshError: undefined })
    expect(service.getSnapshot().accounts.map((item) => item.id)).toEqual(['2'])
  })

  test('pause and stop wait for an in-flight unfollow before preventing later requests', async () => {
    for (const action of ['pause', 'stop'] as const) {
      const { client, coordinator, service } = createService(2)
      client.pages.push(followingPage(['1', '2']))
      let releaseUnfollow = () => {}
      const blocked = new Promise<void>((resolve) => { releaseUnfollow = resolve })
      client.beforeUnfollow = async (id) => { if (id === '1') await blocked }
      await service.scan()

      service.start(['1', '2'])
      await vi.waitFor(() => expect(client.unfollowAttempts).toEqual(['1']))
      service[action]()
      if (action === 'stop') expect(coordinator.currentOwner()).toBe('following')
      releaseUnfollow()
      await vi.waitFor(() => expect(service.getSnapshot().progress.completed).toBe(1))

      expect(client.unfollowAttempts).toEqual(['1'])
      expect(service.getSnapshot().state).toBe(action === 'pause' ? 'paused' : 'stopped')
      expect(coordinator.currentOwner()).toBe(action === 'pause' ? 'following' : undefined)
    }
  })

  test('pauses an All scope when a stale count never yields another account', async () => {
    const { client, service } = createService(4)
    client.pages.push(followingPage(['1']), followingPage([]), followingPage([]), followingPage([]))
    await service.scan()

    await service.startAll()
    await expectState(service, 'paused')
    expect(service.getSnapshot().message).toContain('still reports following accounts')
    expect(client.unfollowAttempts).toEqual(['1'])
  })

  test('rejects conflicting starts while a liked-video task owns the global lock', async () => {
    const { client, coordinator, service } = createService()
    client.pages.push(followingPage(['1']))
    await service.scan()
    coordinator.acquire('likes')

    expect(() => service.start(['1'])).toThrow(/liked-video task is active/i)
  })
})
