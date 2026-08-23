import type { FollowingAccount, VideoItem } from '../../../shared/platforms/contracts.js'
import type {
  PlatformCurrentUser,
  PlatformFollowingPage,
  PlatformVideoPage,
} from '../../shared/platforms/client.js'

export type JsonObject = Record<string, unknown>

export const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null

const readString = (value: JsonObject | undefined, ...keys: string[]) => {
  if (!value) return undefined
  for (const key of keys) {
    const candidate = value[key]
    if (typeof candidate === 'string' || typeof candidate === 'number') return String(candidate)
  }
  return undefined
}

const readNumber = (value: JsonObject | undefined, ...keys: string[]) => {
  const raw = readString(value, ...keys)
  if (raw === undefined) return undefined
  const candidate = Number(raw)
  return Number.isFinite(candidate) ? candidate : undefined
}

const readImage = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value
  if (!isObject(value)) return undefined
  const list = value.urlList ?? value.url_list
  if (Array.isArray(list)) return list.find((candidate): candidate is string => typeof candidate === 'string')
  return readString(value, 'url', 'uri')
}

export function parseTikTokBrowserResponse(result: unknown): JsonObject {
  if (!isObject(result) || typeof result.text !== 'string') {
    throw new Error('TikTok returned an unreadable web response.')
  }
  if (!result.text.trim()) {
    throw new Error(`TikTok returned an empty HTTP ${String(result.status)} response. Its private web contract may have changed.`)
  }
  let payload: JsonObject
  try {
    const parsed: unknown = JSON.parse(result.text)
    payload = isObject(parsed) ? parsed : { statusCode: result.status, statusMsg: result.text.slice(0, 240) }
  } catch {
    payload = { statusCode: result.status, statusMsg: result.text.slice(0, 240) }
  }
  if (!result.ok && payload.statusCode === undefined && payload.status_code === undefined) payload.statusCode = result.status
  return payload
}

export function assertTikTokSuccess(payload: JsonObject) {
  const code = payload.statusCode ?? payload.status_code
  if (code === undefined || Number(code) === 0) return
  const detail = readString(payload, 'statusMsg', 'status_msg', 'message')?.trim() || `status ${String(code)}`
  throw new Error(`TikTok web request was rejected: ${detail}`)
}

export function assertTikTokMutationSuccess(payload: JsonObject) {
  const code = payload.statusCode ?? payload.status_code
  if (code !== undefined && Number(code) === 0) return
  if (code === undefined) throw new Error('TikTok did not report explicit success for the account change.')
  assertTikTokSuccess(payload)
}

export function parseTikTokCurrentUser(payload: JsonObject): PlatformCurrentUser {
  assertTikTokSuccess(payload)
  const data = isObject(payload.data) ? payload.data : undefined
  const userInfo = isObject(payload.userInfo) ? payload.userInfo : isObject(data?.userInfo) ? data.userInfo : undefined
  const stats = isObject(userInfo?.stats) ? userInfo.stats : isObject(payload.stats) ? payload.stats : undefined
  const candidates = [userInfo?.user, payload.user, data?.user, userInfo, data].filter(isObject)
  for (const user of candidates) {
    const id = readString(user, 'secUid', 'sec_uid', 'sec_user_id', 'user_id_str', 'user_id', 'id', 'uid')
    if (!id) continue
    return {
      id,
      name: readString(user, 'nickname', 'screen_name', 'displayName', 'display_name', 'username', 'uniqueId', 'unique_id') ?? 'TikTok user',
      avatar: readImage(user.avatarThumb ?? user.avatar_thumb ?? user.avatarMedium ?? user.avatar_medium ?? user.avatar_url),
      followingCount: readNumber(stats, 'followingCount', 'following_count') ?? readNumber(user, 'followingCount', 'following_count'),
    }
  }
  throw new Error('TikTok did not return the current user. Sign in again and retry.')
}

const videoRecords = (payload: JsonObject) => {
  const records = payload.itemList ?? payload.item_list ?? payload.aweme_list ?? payload.items
  return Array.isArray(records) ? records.filter(isObject) : []
}

export function parseTikTokVideoPage(payload: JsonObject, currentCursor: string): PlatformVideoPage {
  assertTikTokSuccess(payload)
  const videos: VideoItem[] = []
  for (const record of videoRecords(payload)) {
    const id = readString(record, 'id', 'aweme_id', 'itemId', 'item_id')
    if (!id) continue
    const video = isObject(record.video) ? record.video : undefined
    const imagePost = isObject(record.imagePost) ? record.imagePost : undefined
    videos.push({
      id,
      title: readString(record, 'desc', 'description', 'title') ?? 'Untitled video',
      thumbnail: readImage(video?.cover ?? video?.dynamicCover ?? video?.originCover ?? imagePost?.cover),
      status: 'pending',
    })
  }
  const nextCursor = readString(payload, 'cursor', 'maxCursor', 'max_cursor')
  const hasMore = Boolean(payload.hasMore ?? payload.has_more)
  return { videos, nextCursor, hasMore: hasMore && Boolean(nextCursor) && nextCursor !== currentCursor }
}

export function parseTikTokFollowingPage(payload: JsonObject, currentCursor: string): PlatformFollowingPage {
  assertTikTokSuccess(payload)
  const rawRecords = payload.userList ?? payload.user_list ?? payload.followings
  const records = Array.isArray(rawRecords) ? rawRecords.filter(isObject) : []
  const accounts: FollowingAccount[] = []
  for (const record of records) {
    const user = isObject(record.user) ? record.user : record
    const id = readString(user, 'secUid', 'sec_uid', 'sec_user_id', 'id', 'uid')
    if (!id) continue
    const followerStatus = readNumber(user, 'followerStatus', 'follower_status')
    const relationStatus = readNumber(user, 'relation', 'relationStatus', 'relation_status')
    const relation = followerStatus === 1 || relationStatus === 4
      ? 'mutual'
      : followerStatus === 0 || relationStatus === 1
        ? 'following'
        : 'unknown'
    accounts.push({
      id,
      displayName: readString(user, 'nickname', 'displayName', 'display_name') ?? 'TikTok account',
      username: readString(user, 'uniqueId', 'unique_id', 'username'),
      avatar: readImage(user.avatarThumb ?? user.avatar_thumb ?? user.avatarMedium ?? user.avatar_medium),
      relation,
      status: 'pending',
    })
  }
  const nextCursor = readString(payload, 'cursor', 'maxCursor', 'max_cursor')
  const hasMore = Boolean(payload.hasMore ?? payload.has_more)
  return {
    accounts,
    nextCursor,
    hasMore: hasMore && Boolean(nextCursor) && nextCursor !== currentCursor,
    total: readNumber(payload, 'total'),
  }
}
