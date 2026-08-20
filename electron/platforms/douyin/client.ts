import type { DouyinVideo, FollowingAccount, LoginSnapshot } from '../../../shared/platforms/douyin/contracts.js'

export interface DouyinCurrentUser {
  secUserId: string
  name: string
  avatar?: string
  likesCount?: number
  followingCount?: number
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
  loadFavorites: (secUserId: string, cursor: string, count: number) => Promise<DouyinFavoritePage>
  unlike: (videoId: string) => Promise<void>
  loadFollowing: (secUserId: string, cursor: string, count: number) => Promise<DouyinFollowingPage>
  unfollow: (secUserId: string) => Promise<void>
  onWorkspaceCrash: (callback: () => void) => () => void
}
