import type { DouyinVideo, FollowingAccount, LoginSnapshot } from '../../../shared/platforms/douyin/contracts.js'
import type { DouyinCurrentUser, DouyinFavoritePage, DouyinFollowingPage } from './client.js'

export type JsonObject = Record<string, unknown>

export interface BrowserResponse {
  ok: boolean
  status: number
  text: string
}

export const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null

const readString = (value: JsonObject, key: string) => {
  const candidate = value[key]
  return typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : undefined
}

const readNumber = (value: JsonObject, key: string) => {
  const raw = value[key]
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined
  const candidate = Number(raw)
  return Number.isFinite(candidate) ? candidate : undefined
}

export function parseBrowserResponse(result: unknown): JsonObject {
  if (!isObject(result) || typeof result.text !== 'string') {
    throw new Error('Douyin returned an unreadable API response.')
  }

  let payload: JsonObject
  try {
    const parsed: unknown = JSON.parse(result.text)
    payload = isObject(parsed)
      ? parsed
      : { status_code: result.status, status_msg: result.text.slice(0, 240) }
  } catch {
    payload = { status_code: result.status, status_msg: result.text.slice(0, 240) }
  }
  if (!result.ok && payload.status_code === undefined) payload.status_code = result.status
  return payload
}

export function assertDouyinSuccess(payload: JsonObject) {
  const code = payload.status_code ?? payload.statusCode
  if (code === undefined || Number(code) === 0) return
  const detail = readString(payload, 'status_msg') ?? readString(payload, 'message') ?? `status ${String(code)}`
  throw new Error(`Douyin API request was rejected: ${detail}`)
}

export function assertDouyinMutationSuccess(payload: JsonObject) {
  const code = payload.status_code ?? payload.statusCode
  if (code !== undefined && Number(code) === 0) return
  if (code === undefined) {
    throw new Error('Douyin did not report explicit success for the account change.')
  }
  assertDouyinSuccess(payload)
}

export function parseCurrentUser(payload: JsonObject): DouyinCurrentUser {
  assertDouyinSuccess(payload)
  const data = isObject(payload.data) ? payload.data : undefined
  const candidates = [payload.user, payload.user_info, data?.user, data?.user_info, data].filter(isObject)
  for (const user of candidates) {
    const id = readString(user, 'sec_uid') ?? readString(user, 'sec_user_id')
    if (!id) continue
    const avatarObject = isObject(user.avatar_thumb) ? user.avatar_thumb : undefined
    const avatarSources = avatarObject && Array.isArray(avatarObject.url_list) ? avatarObject.url_list : []
    return {
      id,
      name: readString(user, 'displayName') ?? readString(user, 'unique_id') ?? 'Douyin user',
      avatar: avatarSources.find((source): source is string => typeof source === 'string'),
      likedVideosCount: readNumber(user, 'favoriting_count'),
      followingCount: readNumber(user, 'following_count'),
      collectedVideosCount: readNumber(user, 'collect_count'),
    }
  }
  throw new Error('Douyin did not return the current user. Sign in again and retry.')
}

export function parseFollowingPage(payload: JsonObject, currentCursor: string): DouyinFollowingPage {
  assertDouyinSuccess(payload)
  const accounts: FollowingAccount[] = []
  const records = Array.isArray(payload.followings) ? payload.followings.filter(isObject) : []
  for (const record of records) {
    const id = readString(record, 'sec_uid') ?? readString(record, 'sec_user_id')
    if (!id) continue
    const avatarObject = isObject(record.avatar_thumb) ? record.avatar_thumb : undefined
    const avatarSources = avatarObject && Array.isArray(avatarObject.url_list) ? avatarObject.url_list : []
    const username = readString(record, 'unique_id') || undefined
    accounts.push({
      id,
      displayName: readString(record, 'displayName') || 'Douyin account',
      username,
      avatar: avatarSources.find((source): source is string => typeof source === 'string'),
      relation: readNumber(record, 'follower_status') === 1 ? 'mutual' : 'following',
      status: 'pending',
    })
  }

  const nextCursor = readString(payload, 'min_time') ?? readString(payload, 'max_time')
  return {
    accounts,
    nextCursor,
    hasMore: Boolean(payload.has_more && nextCursor && nextCursor !== currentCursor),
    total: readNumber(payload, 'total'),
  }
}

export function parseFavoritePage(payload: JsonObject, currentCursor: string): DouyinFavoritePage {
  assertDouyinSuccess(payload)
  const videos: DouyinVideo[] = []
  const records = Array.isArray(payload.aweme_list) ? payload.aweme_list.filter(isObject) : []
  for (const record of records) {
    const id = readString(record, 'aweme_id')
    if (!id) continue
    const video = isObject(record.video) ? record.video : undefined
    const cover = video && isObject(video.cover) ? video.cover : undefined
    const sources = cover && Array.isArray(cover.url_list) ? cover.url_list : []
    videos.push({
      id,
      title: readString(record, 'desc') || 'Untitled video',
      thumbnail: sources.find((source): source is string => typeof source === 'string'),
      status: 'pending',
    })
  }

  const nextCursor = readString(payload, 'max_cursor') ?? readString(payload, 'cursor')
  return {
    videos,
    nextCursor,
    hasMore: Boolean(payload.has_more && nextCursor && nextCursor !== currentCursor),
  }
}

export function parseLoginSurfaceResult(result: unknown): LoginSnapshot {
  if (!isObject(result)) throw new Error('Douyin did not return a readable QR code state.')
  if (result.state === 'ready') return { state: 'ready', qrCode: typeof result.qrCode === 'string' ? result.qrCode : undefined }
  if (result.state === 'verification') return { state: 'verification' }
  return { state: 'loading' }
}
