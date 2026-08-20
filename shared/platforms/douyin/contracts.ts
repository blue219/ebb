export type TaskState = 'idle' | 'scanning' | 'ready' | 'running' | 'paused' | 'completed' | 'stopped'
export type TaskMode = 'selected' | 'limited' | 'all'
export type VideoStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type FollowingAccountStatus = VideoStatus
export type FollowingRelation = 'following' | 'mutual'

export const DOUYIN_IPC_CHANNELS = {
  getState: 'douyin:get-state',
  showLogin: 'douyin:show-login',
  refreshLogin: 'douyin:refresh-login',
  hideLogin: 'douyin:hide-login',
  scan: 'douyin:scan',
  loadMore: 'douyin:load-more',
  refreshCompletedList: 'douyin:refresh-completed-list',
  start: 'douyin:start',
  startAll: 'douyin:start-all',
  pause: 'douyin:pause',
  resume: 'douyin:resume',
  stop: 'douyin:stop',
  signOut: 'douyin:sign-out',
  status: 'douyin:status',
  account: 'douyin:account',
  login: 'douyin:login',
  following: {
    scan: 'douyin:following:scan',
    loadMore: 'douyin:following:load-more',
    refreshCompletedList: 'douyin:following:refresh-completed-list',
    start: 'douyin:following:start',
    startAll: 'douyin:following:start-all',
    pause: 'douyin:following:pause',
    resume: 'douyin:following:resume',
    stop: 'douyin:following:stop',
    status: 'douyin:following:status',
  },
} as const

export interface DouyinVideo {
  id: string
  title: string
  thumbnail?: string
  status: VideoStatus
}

export interface FollowingAccount {
  secUserId: string
  nickname: string
  uniqueId?: string
  avatar?: string
  relation: FollowingRelation
  status: FollowingAccountStatus
}

export interface TaskCounts {
  loaded: number
  selected: number
  completed: number
  failed: number
}

export interface TaskSnapshot {
  state: TaskState
  mode?: TaskMode
  videos: DouyinVideo[]
  counts: TaskCounts
  progress: {
    completed: number
    total: number
  }
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
  progress: {
    completed: number
    total: number
  }
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
  likesCount?: number
  followingCount?: number
  message?: string
}

export type LoginState = 'idle' | 'loading' | 'ready' | 'verification' | 'error'

export interface LoginSnapshot {
  state: LoginState
  qrCode?: string
  message?: string
}

export interface DouyinStateSnapshot {
  task: TaskSnapshot
  followingTask: FollowingTaskSnapshot
  account: AccountSnapshot
  login: LoginSnapshot
}

export interface DouyinBridge {
  getState: () => Promise<DouyinStateSnapshot>
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
