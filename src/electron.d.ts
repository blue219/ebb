type TaskState = 'idle' | 'scanning' | 'ready' | 'running' | 'paused' | 'completed' | 'stopped'
type VideoStatus = 'pending' | 'processing' | 'completed' | 'failed'

interface DouyinVideo {
  id: string
  title: string
  thumbnail?: string
  status: VideoStatus
}

interface TaskSnapshot {
  state: TaskState
  videos: DouyinVideo[]
  counts: {
    loaded: number
    selected: number
    completed: number
    failed: number
  }
  currentVideoId?: string
  message?: string
}

interface Window {
  ebb: {
    platform: string
    douyin: {
      open: () => Promise<void>
      scan: () => Promise<void>
      start: (selectedIds: string[]) => Promise<void>
      pause: () => Promise<void>
      resume: (selectedIds: string[]) => Promise<void>
      stop: () => Promise<void>
      signOut: () => Promise<void>
      onStatus: (callback: (snapshot: TaskSnapshot) => void) => () => void
    }
  }
}
