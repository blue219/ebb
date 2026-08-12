export type TaskState = 'idle' | 'scanning' | 'ready' | 'running' | 'paused' | 'completed' | 'stopped'
export type TaskMode = 'selected' | 'limited' | 'all'
export type VideoStatus = 'pending' | 'processing' | 'completed' | 'failed'

export const DOUYIN_IPC_CHANNELS = {
  getState: 'douyin:get-state',
  showLogin: 'douyin:show-login',
  refreshLogin: 'douyin:refresh-login',
  hideLogin: 'douyin:hide-login',
  scan: 'douyin:scan',
  loadMore: 'douyin:load-more',
  start: 'douyin:start',
  startAll: 'douyin:start-all',
  pause: 'douyin:pause',
  resume: 'douyin:resume',
  stop: 'douyin:stop',
  signOut: 'douyin:sign-out',
  status: 'douyin:status',
  account: 'douyin:account',
  login: 'douyin:login',
} as const

export interface DouyinVideo {
  id: string
  title: string
  thumbnail?: string
  status: VideoStatus
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
  message?: string
}

export type AccountState = 'checking' | 'signedOut' | 'signedIn'

export interface AccountSnapshot {
  state: AccountState
  name?: string
  avatar?: string
  likesCount?: number
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
  start: (selectedIds: string[]) => Promise<void>
  startAll: (limit?: number) => Promise<void>
  pause: () => Promise<void>
  resume: (selectedIds: string[]) => Promise<void>
  stop: () => Promise<void>
  signOut: () => Promise<void>
  onStatus: (callback: (snapshot: TaskSnapshot) => void) => () => void
  onAccount: (callback: (snapshot: AccountSnapshot) => void) => () => void
  onLogin: (callback: (snapshot: LoginSnapshot) => void) => () => void
}
