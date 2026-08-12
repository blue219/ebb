import type { DouyinVideo, LoginSnapshot } from '../../../shared/platforms/douyin/contracts.js'

export interface DouyinCurrentUser {
  secUserId: string
  name: string
  avatar?: string
  likesCount?: number
}

export interface DouyinFavoritePage {
  videos: DouyinVideo[]
  nextCursor?: string
  hasMore: boolean
}

export interface DouyinClient {
  initialize: () => Promise<void>
  dispose: () => void
  refreshLogin: () => Promise<void>
  clearSession: () => Promise<void>
  flushSession: () => void
  getCurrentUser: () => Promise<DouyinCurrentUser>
  readLoginSurface: () => Promise<LoginSnapshot>
  loadFavorites: (secUserId: string, cursor: string, count: number) => Promise<DouyinFavoritePage>
  unlike: (videoId: string) => Promise<void>
  onWorkspaceCrash: (callback: () => void) => () => void
}
