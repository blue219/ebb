type TaskState = 'idle' | 'scanning' | 'ready' | 'running' | 'paused' | 'completed' | 'stopped'
type TaskMode = 'selected' | 'limited' | 'all'
type VideoStatus = 'pending' | 'processing' | 'completed' | 'failed'
type AccountState = 'checking' | 'signedOut' | 'signedIn'
type LoginState = 'idle' | 'loading' | 'ready' | 'verification' | 'error'

interface AccountSnapshot {
  state: AccountState
  name?: string
  avatar?: string
  likesCount?: number
  message?: string
}

interface LoginSnapshot {
  state: LoginState
  qrCode?: string
  message?: string
}

interface DouyinVideo {
  id: string
  title: string
  thumbnail?: string
  status: VideoStatus
}

interface TaskSnapshot {
  state: TaskState
  mode?: TaskMode
  videos: DouyinVideo[]
  counts: {
    loaded: number
    selected: number
    completed: number
    failed: number
  }
  progress: {
    completed: number
    total: number
  }
  currentVideoId?: string
  hasMore: boolean
  isLoadingMore: boolean
  message?: string
}

interface Window {
  ebb: {
    platform: string
    douyin: {
      getState: () => Promise<{ task: TaskSnapshot; account: AccountSnapshot; login: LoginSnapshot }>
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
  }
}
