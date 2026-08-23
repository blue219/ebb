import type { FollowingAccount, LoginSnapshot, VideoItem } from '../../../shared/platforms/contracts.js'

export interface PlatformCurrentUser {
  id: string
  name: string
  avatar?: string
  likedVideosCount?: number
  followingCount?: number
  collectedVideosCount?: number
}

export interface PlatformVideoPage {
  videos: VideoItem[]
  nextCursor?: string
  hasMore: boolean
}

export interface PlatformFollowingPage {
  accounts: FollowingAccount[]
  nextCursor?: string
  hasMore: boolean
  total?: number
}

export interface PlatformClient {
  initialize: () => Promise<void>
  dispose: () => void
  refreshLogin: () => Promise<void>
  clearSession: () => Promise<void>
  flushSession: () => void
  getCurrentUser: () => Promise<PlatformCurrentUser>
  readLoginSurface: () => Promise<LoginSnapshot>
  loadFavorites: (userId: string, cursor: string, count: number) => Promise<PlatformVideoPage>
  unlike: (videoId: string) => Promise<void>
  loadCollections: (userId: string, cursor: string, count: number) => Promise<PlatformVideoPage>
  uncollect: (videoId: string) => Promise<void>
  loadFollowing: (userId: string, cursor: string, count: number) => Promise<PlatformFollowingPage>
  unfollow: (userId: string) => Promise<void>
  onWorkspaceCrash: (callback: () => void) => () => void
}

export interface PlatformRuntimeConfig {
  id: 'douyin' | 'tiktok'
  displayName: 'Douyin' | 'TikTok'
  favoritesPageSize: number
  collectionsPageSize: number
  followingPageSize: number
  videoPrefetchThreshold: number
  followingPrefetchThreshold: number
}

export const DOUYIN_RUNTIME_CONFIG: PlatformRuntimeConfig = {
  id: 'douyin',
  displayName: 'Douyin',
  favoritesPageSize: 30,
  collectionsPageSize: 30,
  followingPageSize: 20,
  videoPrefetchThreshold: 10,
  followingPrefetchThreshold: 5,
}

export const TIKTOK_RUNTIME_CONFIG: PlatformRuntimeConfig = {
  id: 'tiktok',
  displayName: 'TikTok',
  favoritesPageSize: 30,
  collectionsPageSize: 30,
  followingPageSize: 30,
  videoPrefetchThreshold: 10,
  followingPrefetchThreshold: 10,
}
