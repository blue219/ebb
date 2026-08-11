import { BrowserWindow, session, type Session } from 'electron'

import {
  FAVORITES_LIMIT,
  FAVORITES_PAGE_LIMIT,
  FAVORITES_PAGE_SIZE,
  isDouyinUrl,
  registerDouyinNavigationGuards,
} from './douyin-policy.js'

export type TaskState = 'idle' | 'scanning' | 'ready' | 'running' | 'paused' | 'completed' | 'stopped'
export type VideoStatus = 'pending' | 'processing' | 'completed' | 'failed'

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
  videos: DouyinVideo[]
  counts: TaskCounts
  currentVideoId?: string
  message?: string
}

type JsonObject = Record<string, unknown>
type StatusPublisher = (snapshot: TaskSnapshot) => void

const DOUYIN_ORIGIN = 'https://www.douyin.com'
const DOUYIN_API_ORIGIN = 'https://www-hj.douyin.com'
const DOUYIN_PARTITION = 'persist:ebb-douyin'

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null

const readString = (value: JsonObject, key: string) => {
  const candidate = value[key]
  return typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : undefined
}

export class DouyinTaskService {
  private workWindow?: BrowserWindow
  private state: TaskState = 'idle'
  private videos: DouyinVideo[] = []
  private currentVideoId?: string
  private message?: string
  private isRunning = false
  private readonly publish: StatusPublisher

  constructor(publish: StatusPublisher) {
    this.publish = publish
  }

  async openWorkWindow() {
    if (this.workWindow && !this.workWindow.isDestroyed()) {
      this.workWindow.show()
      this.workWindow.focus()
      return
    }

    this.workWindow = new BrowserWindow({
      width: 1200,
      height: 820,
      minWidth: 960,
      minHeight: 640,
      title: 'Douyin — Ebb workspace',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: DOUYIN_PARTITION,
      },
    })

    registerDouyinNavigationGuards(this.workWindow.webContents)
    this.workWindow.on('closed', () => {
      this.workWindow = undefined
    })
    await this.workWindow.loadURL(DOUYIN_ORIGIN)
  }

  async scan() {
    this.getWorkspaceSession()
    this.state = 'scanning'
    this.message = 'Loading liked videos through the Douyin web API.'
    this.publishSnapshot()

    try {
      const secUserId = await this.getCurrentUserId()
      const found = new Map<string, DouyinVideo>()
      let cursor = '0'

      for (let page = 0; page < FAVORITES_PAGE_LIMIT; page += 1) {
        const payload = await this.requestApi('/aweme/v1/web/aweme/favorite/', {
          aid: '6383',
          count: String(FAVORITES_PAGE_SIZE),
          max_cursor: cursor,
          sec_user_id: secUserId,
        })
        this.throwIfApiError(payload)

        const records = Array.isArray(payload.aweme_list)
          ? payload.aweme_list.filter(isObject).slice(0, FAVORITES_LIMIT - found.size)
          : []
        for (const record of records) {
          const video = this.toVideo(record)
          if (video) found.set(video.id, video)
        }

        this.message = `Loaded ${found.size} liked videos so far.`
        this.publishSnapshot()

        const nextCursor = readString(payload, 'max_cursor')
        if (!payload.has_more || !nextCursor || nextCursor === cursor) break
        cursor = nextCursor
      }

      this.videos = [...found.values()]
      this.state = 'ready'
      this.message = this.videos.length
        ? `Loaded ${this.videos.length} liked videos through the Douyin web API.`
        : 'No liked videos were returned. Confirm that the Douyin workspace is signed in, then scan again.'
    } catch (error) {
      this.state = 'paused'
      this.message = this.errorMessage(error)
    }

    this.publishSnapshot()
  }

  start(selectedIds: string[]) {
    if (!selectedIds.length) throw new Error('Select at least one video before starting.')
    if (this.isRunning) return

    const selected = new Set(selectedIds)
    const knownIds = new Set(this.videos.map((video) => video.id))
    if (selectedIds.some((id) => !knownIds.has(id))) throw new Error('The selection is no longer available. Scan again.')

    for (const video of this.videos) {
      if (selected.has(video.id) && video.status !== 'completed') video.status = 'pending'
    }
    this.state = 'running'
    this.message = 'Removing likes through the Douyin web API.'
    this.publishSnapshot(selected)
    void this.processQueue(selected)
  }

  pause() {
    if (this.state !== 'running') return
    this.state = 'paused'
    this.message = 'Paused by you. No further API requests will be sent until you continue.'
    this.publishSnapshot()
  }

  resume(selectedIds: string[]) {
    if (this.state !== 'paused') return
    this.start(selectedIds)
  }

  stop() {
    if (!['running', 'paused'].includes(this.state)) return
    this.state = 'stopped'
    this.currentVideoId = undefined
    this.message = 'Task stopped. Unprocessed videos remain selected.'
    this.publishSnapshot()
  }

  async signOut() {
    this.stop()
    await session.fromPartition(DOUYIN_PARTITION).clearStorageData()
    if (this.workWindow && !this.workWindow.isDestroyed()) await this.workWindow.loadURL(DOUYIN_ORIGIN)
    this.state = 'idle'
    this.videos = []
    this.message = 'Signed out from the Ebb Douyin workspace.'
    this.publishSnapshot()
  }

  private async processQueue(selectedIds: Set<string>) {
    this.isRunning = true
    try {
      this.getWorkspaceSession()
      for (const video of this.videos) {
        if (!selectedIds.has(video.id) || video.status === 'completed') continue
        if (this.state !== 'running') return

        this.currentVideoId = video.id
        video.status = 'processing'
        this.publishSnapshot(selectedIds)

        try {
          const payload = await this.requestApi('/aweme/v1/web/commit/item/digg/', {
            aid: '6383',
            aweme_id: video.id,
            type: '0',
          }, 'POST')
          this.throwIfApiError(payload)
          video.status = 'completed'
        } catch (error) {
          video.status = 'failed'
          this.state = 'paused'
          this.message = this.errorMessage(error)
          this.publishSnapshot(selectedIds)
          return
        }

        this.currentVideoId = undefined
        this.publishSnapshot(selectedIds)
        await sleep(180 + Math.round(Math.random() * 140))
      }

      if (this.state === 'running') {
        this.state = 'completed'
        this.message = 'The selected videos have been processed.'
        this.publishSnapshot(selectedIds)
      }
    } catch (error) {
      this.state = 'paused'
      this.message = this.errorMessage(error)
      this.publishSnapshot(selectedIds)
    } finally {
      this.isRunning = false
    }
  }

  private async getCurrentUserId() {
    const payload = await this.requestApi('/aweme/v1/web/user/profile/self/', { aid: '6383' })
    this.throwIfApiError(payload)

    const candidates = [payload.user, payload.user_info, payload.data].filter(isObject)
    for (const user of candidates) {
      const secUserId = readString(user, 'sec_uid') ?? readString(user, 'sec_user_id')
      if (secUserId) return secUserId
    }
    throw new Error('Douyin did not return the current user. Sign in again in the workspace and retry.')
  }

  private toVideo(record: JsonObject): DouyinVideo | undefined {
    const id = readString(record, 'aweme_id')
    if (!id) return undefined

    const video = isObject(record.video) ? record.video : undefined
    const cover = video && isObject(video.cover) ? video.cover : undefined
    const sources = cover && Array.isArray(cover.url_list) ? cover.url_list : []
    const thumbnail = sources.find((source): source is string => typeof source === 'string')
    return {
      id,
      title: readString(record, 'desc') || 'Untitled video',
      thumbnail,
      status: 'pending',
    }
  }

  private async requestApi(path: string, query: Record<string, string>, method: 'GET' | 'POST' = 'GET') {
    const url = new URL(path, DOUYIN_API_ORIGIN)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    const workWindow = this.getWorkspaceWindow()
    if (!isDouyinUrl(workWindow.webContents.getURL())) {
      throw new Error('Wait for the Douyin workspace to finish loading, then scan again.')
    }

    // Douyin validates the browser page context in addition to the signed-in session cookies.
    const result: unknown = await workWindow.webContents.executeJavaScript(`
      (async () => {
        const response = await fetch(${JSON.stringify(url.href)}, {
          credentials: 'include',
          headers: { Accept: 'application/json, text/plain, */*' },
          method: ${JSON.stringify(method)},
        })
        return { ok: response.ok, status: response.status, text: await response.text() }
      })()
    `)
    if (!isObject(result) || typeof result.text !== 'string') {
      throw new Error('Douyin returned an unreadable API response.')
    }

    const text = result.text
    let payload: JsonObject
    try {
      const parsed: unknown = JSON.parse(text)
      payload = isObject(parsed) ? parsed : { status_code: result.status, status_msg: text.slice(0, 240) }
    } catch {
      payload = { status_code: result.status, status_msg: text.slice(0, 240) }
    }
    if (!result.ok && payload.status_code === undefined) payload.status_code = result.status
    return payload
  }

  private throwIfApiError(payload: JsonObject) {
    const code = payload.status_code ?? payload.statusCode
    if (code === undefined || Number(code) === 0) return
    const detail = readString(payload, 'status_msg') ?? readString(payload, 'message') ?? `status ${String(code)}`
    throw new Error(`Douyin API request was rejected: ${detail}`)
  }

  private getWorkspaceSession(): Session {
    this.getWorkspaceWindow()
    return session.fromPartition(DOUYIN_PARTITION)
  }

  private getWorkspaceWindow() {
    if (!this.workWindow || this.workWindow.isDestroyed()) {
      throw new Error('Open the Douyin workspace and sign in before running this task.')
    }
    return this.workWindow
  }

  private publishSnapshot(selectedIds = new Set<string>()) {
    const counts: TaskCounts = {
      loaded: this.videos.length,
      selected: this.videos.filter((video) => selectedIds.has(video.id)).length,
      completed: this.videos.filter((video) => video.status === 'completed').length,
      failed: this.videos.filter((video) => video.status === 'failed').length,
    }
    this.publish({
      state: this.state,
      videos: [...this.videos],
      counts,
      currentVideoId: this.currentVideoId,
      message: this.message,
    })
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'An unexpected task error occurred.'
  }
}
