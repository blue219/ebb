export type PlatformId = 'douyin' | 'tiktok'
export type TaskState = 'idle' | 'scanning' | 'ready' | 'running' | 'paused' | 'completed' | 'stopped'
export type TaskMode = 'selected' | 'limited' | 'all'
export type ItemStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type FollowingRelation = 'following' | 'mutual' | 'unknown'

export const createPlatformIpcChannels = (platform: PlatformId) => ({
  getState: `${platform}:get-state`,
  showLogin: `${platform}:show-login`,
  refreshLogin: `${platform}:refresh-login`,
  hideLogin: `${platform}:hide-login`,
  scan: `${platform}:scan`,
  loadMore: `${platform}:load-more`,
  refreshCompletedList: `${platform}:refresh-completed-list`,
  start: `${platform}:start`,
  startAll: `${platform}:start-all`,
  pause: `${platform}:pause`,
  resume: `${platform}:resume`,
  stop: `${platform}:stop`,
  signOut: `${platform}:sign-out`,
  status: `${platform}:status`,
  account: `${platform}:account`,
  login: `${platform}:login`,
  following: {
    scan: `${platform}:following:scan`,
    loadMore: `${platform}:following:load-more`,
    refreshCompletedList: `${platform}:following:refresh-completed-list`,
    start: `${platform}:following:start`,
    startAll: `${platform}:following:start-all`,
    pause: `${platform}:following:pause`,
    resume: `${platform}:following:resume`,
    stop: `${platform}:following:stop`,
    status: `${platform}:following:status`,
  },
  collection: {
    scan: `${platform}:collection:scan`,
    loadMore: `${platform}:collection:load-more`,
    refreshCompletedList: `${platform}:collection:refresh-completed-list`,
    start: `${platform}:collection:start`,
    startAll: `${platform}:collection:start-all`,
    pause: `${platform}:collection:pause`,
    resume: `${platform}:collection:resume`,
    stop: `${platform}:collection:stop`,
    status: `${platform}:collection:status`,
  },
} as const)

export type PlatformIpcChannels = ReturnType<typeof createPlatformIpcChannels>

export interface VideoItem {
  id: string
  title: string
  thumbnail?: string
  status: ItemStatus
}

export interface FollowingAccount {
  id: string
  displayName: string
  username?: string
  avatar?: string
  relation: FollowingRelation
  status: ItemStatus
}

export interface TaskCounts {
  loaded: number
  selected: number
  completed: number
  failed: number
}

export interface TaskProgress {
  completed: number
  total: number | null
}

export interface TaskSnapshot {
  state: TaskState
  mode?: TaskMode
  videos: VideoItem[]
  counts: TaskCounts
  progress: TaskProgress
  currentVideoId?: string
  hasMore: boolean
  isLoadingMore: boolean
  isRefreshingCompletedList: boolean
  completionRefreshError?: string
  message?: string
}

export interface FollowingTaskSnapshot {
  state: TaskState
  mode?: TaskMode
  accounts: FollowingAccount[]
  counts: TaskCounts
  progress: TaskProgress
  currentAccountId?: string
  hasMore: boolean
  isLoadingMore: boolean
  isRefreshingCompletedList: boolean
  completionRefreshError?: string
  message?: string
}

export type AccountState = 'checking' | 'signedOut' | 'signedIn'

export interface AccountSnapshot {
  state: AccountState
  name?: string
  avatar?: string
  likedVideosCount?: number
  followingCount?: number
  collectedVideosCount?: number
  message?: string
}

export type LoginState = 'idle' | 'loading' | 'ready' | 'verification' | 'error'

export interface LoginSnapshot {
  state: LoginState
  qrCode?: string
  message?: string
}

export interface PlatformStateSnapshot {
  task: TaskSnapshot
  followingTask: FollowingTaskSnapshot
  collectionTask: TaskSnapshot
  account: AccountSnapshot
  login: LoginSnapshot
}

export interface FollowingBridge {
  scan: () => Promise<void>
  loadMore: () => Promise<void>
  refreshCompletedList: () => Promise<void>
  start: (selectedIds: string[]) => Promise<void>
  startAll: (limit?: number) => Promise<void>
  pause: () => Promise<void>
  resume: (selectedIds: string[]) => Promise<void>
  stop: () => Promise<void>
  onStatus: (callback: (snapshot: FollowingTaskSnapshot) => void) => () => void
}

export interface CollectionBridge {
  scan: () => Promise<void>
  loadMore: () => Promise<void>
  refreshCompletedList: () => Promise<void>
  start: (selectedIds: string[]) => Promise<void>
  startAll: (limit?: number) => Promise<void>
  pause: () => Promise<void>
  resume: (selectedIds: string[]) => Promise<void>
  stop: () => Promise<void>
  onStatus: (callback: (snapshot: TaskSnapshot) => void) => () => void
}

export interface PlatformBridge {
  getState: () => Promise<PlatformStateSnapshot>
  showLogin: () => Promise<void>
  refreshLogin: () => Promise<void>
  hideLogin: () => Promise<void>
  scan: () => Promise<void>
  loadMore: () => Promise<void>
  refreshCompletedList: () => Promise<void>
  start: (selectedIds: string[]) => Promise<void>
  startAll: (limit?: number) => Promise<void>
  pause: () => Promise<void>
  resume: (selectedIds: string[]) => Promise<void>
  stop: () => Promise<void>
  signOut: () => Promise<void>
  onStatus: (callback: (snapshot: TaskSnapshot) => void) => () => void
  onAccount: (callback: (snapshot: AccountSnapshot) => void) => () => void
  onLogin: (callback: (snapshot: LoginSnapshot) => void) => () => void
  following: FollowingBridge
  collection: CollectionBridge
}
