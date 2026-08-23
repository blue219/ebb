import type { DouyinVideo, FollowingAccount, LoginSnapshot } from '../../../shared/platforms/douyin/contracts.js'

export interface DouyinCurrentUser {
  id: string
  name: string
  avatar?: string
  likedVideosCount?: number
  followingCount?: number
  collectedVideosCount?: number
}

export interface DouyinFavoritePage {
  videos: DouyinVideo[]
  nextCursor?: string
  hasMore: boolean
}

export interface DouyinFollowingPage {
  accounts: FollowingAccount[]
  nextCursor?: string
  hasMore: boolean
  total?: number
}

export interface DouyinClient {
  initialize: () => Promise<void>
  dispose: () => void
  refreshLogin: () => Promise<void>
  clearSession: () => Promise<void>
  flushSession: () => void
  getCurrentUser: () => Promise<DouyinCurrentUser>
  readLoginSurface: () => Promise<LoginSnapshot>
  loadFavorites: (id: string, cursor: string, count: number) => Promise<DouyinFavoritePage>
  unlike: (videoId: string) => Promise<void>
  loadCollections: (id: string, cursor: string, count: number) => Promise<DouyinFavoritePage>
  uncollect: (videoId: string) => Promise<void>
  loadFollowing: (id: string, cursor: string, count: number) => Promise<DouyinFollowingPage>
  unfollow: (id: string) => Promise<void>
  onWorkspaceCrash: (callback: () => void) => () => void
}
