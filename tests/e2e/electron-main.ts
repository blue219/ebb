import { app, BrowserWindow, ipcMain, session } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
  AccountSnapshot,
  FollowingTaskSnapshot,
  LoginSnapshot,
  TaskSnapshot,
} from '../../shared/platforms/douyin/contracts.js'
import { DOUYIN_IPC_CHANNELS } from '../../shared/platforms/douyin/contracts.js'
import { registerDouyinIpcHandlers } from '../../electron/platforms/douyin/ipc-handlers.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(currentDirectory, '..')
const scenario = process.env.EBB_E2E_SCENARIO ?? 'success'
const userDataPath = process.env.EBB_E2E_USER_DATA
if (!userDataPath) throw new Error('EBB_E2E_USER_DATA is required for isolated Electron tests.')
app.setPath('userData', userDataPath)

let mainWindow: BrowserWindow | undefined
let externalRequestCount = 0
let account: AccountSnapshot = { state: 'signedIn', name: 'Offline tester', likedVideosCount: 2, followingCount: 2, collectedVideosCount: 2 }
let login: LoginSnapshot = { state: 'idle' }
let task: TaskSnapshot = {
  state: 'ready',
  videos: [
    { id: 'fixture-1', title: 'Offline first video', status: 'pending' },
    { id: 'fixture-2', title: 'Offline second video', status: 'pending' },
  ],
  counts: { loaded: 2, selected: 0, completed: 0, failed: 0 },
  progress: { completed: 0, total: 0 },
  hasMore: false,
  isLoadingMore: false,
  isRefreshingCompletedList: false,
}
let followingTask: FollowingTaskSnapshot = {
  state: 'ready',
  accounts: [
    { id: 'offline-account-1', displayName: 'Offline first account', username: 'offline-first', relation: 'mutual', status: 'pending' },
    { id: 'offline-account-2', displayName: 'Offline second account', username: 'offline-second', relation: 'following', status: 'pending' },
  ],
  counts: { loaded: 2, selected: 0, completed: 0, failed: 0 },
  progress: { completed: 0, total: 0 },
  hasMore: false,
  isLoadingMore: false,
  isRefreshingCompletedList: false,
}
let collectionTask: TaskSnapshot = {
  state: 'ready',
  videos: [
    { id: 'saved-fixture-1', title: 'Offline saved video', status: 'pending' },
    { id: 'saved-fixture-2', title: 'Offline second saved video', status: 'pending' },
  ],
  counts: { loaded: 2, selected: 0, completed: 0, failed: 0 },
  progress: { completed: 0, total: 0 },
  hasMore: false,
  isLoadingMore: false,
  isRefreshingCompletedList: false,
}

const publishTask = () => mainWindow?.webContents.send(DOUYIN_IPC_CHANNELS.status, task)
const publishFollowingTask = () => mainWindow?.webContents.send(DOUYIN_IPC_CHANNELS.following.status, followingTask)
const publishCollectionTask = () => mainWindow?.webContents.send(DOUYIN_IPC_CHANNELS.collection.status, collectionTask)
const beginTask = (mode: 'selected' | 'limited' | 'all', total: number) => {
  if (scenario === 'error') {
    task = {
      ...task,
      state: 'paused',
      mode,
      videos: task.videos.map((item, index) => index === 0 ? { ...item, status: 'failed' } : item),
      counts: { ...task.counts, failed: 1, selected: total },
      progress: { completed: 0, total },
      message: 'Douyin API request was rejected: offline fixture failure',
    }
  } else {
    task = {
      ...task,
      state: 'running',
      mode,
      counts: { ...task.counts, selected: total },
      progress: { completed: 0, total },
      message: 'Offline removal fixture is running.',
    }
  }
  publishTask()
}

const likedVideoController = {
  getTaskSnapshot: () => task,
  getAccountSnapshot: () => account,
  getLoginSnapshot: () => login,
  async showLogin() {
    login = { state: 'ready', qrCode: 'data:image/png;base64,aA==' }
    mainWindow?.webContents.send(DOUYIN_IPC_CHANNELS.login, login)
  },
  async refreshLogin() {},
  hideLogin() {},
  async scan() { publishTask() },
  async loadMore() {},
  async refreshCompletedList() {},
  start(selectedIds: string[]) { beginTask('selected', selectedIds.length) },
  async startAll(limit?: number) { beginTask(limit === undefined ? 'all' : 'limited', limit ?? account.likedVideosCount ?? 0) },
  pause() {
    if (task.state !== 'running') return
    task = { ...task, state: 'paused', message: 'Paused by the offline fixture.' }
    publishTask()
  },
  resume() {
    if (task.state !== 'paused' || scenario === 'error') return
    task = { ...task, state: 'running' }
    publishTask()
    setTimeout(() => {
      const completed = task.progress.total
      task = {
        ...task,
        state: 'completed',
        videos: task.videos.map((item) => ({ ...item, status: 'completed' })),
        counts: { ...task.counts, completed, failed: 0 },
        progress: { completed, total: completed },
        message: 'Offline removal fixture completed.',
      }
      account = { ...account, likedVideosCount: Math.max(0, (account.likedVideosCount ?? 0) - completed) }
      publishTask()
      mainWindow?.webContents.send(DOUYIN_IPC_CHANNELS.account, account)
    }, 30)
  },
  stop() {
    task = { ...task, state: 'stopped', message: 'Stopped by the offline fixture.' }
    publishTask()
  },
  async signOut() {
    account = { state: 'signedOut' }
    task = { ...task, state: 'idle', videos: [], counts: { loaded: 0, selected: 0, completed: 0, failed: 0 } }
    mainWindow?.webContents.send(DOUYIN_IPC_CHANNELS.account, account)
    publishTask()
  },
  resetForSignOut() {},
}

const collectionController = {
  getTaskSnapshot: () => collectionTask,
  getAccountSnapshot: () => account,
  getLoginSnapshot: () => login,
  async showLogin() {}, async refreshLogin() {}, hideLogin() {},
  async scan() { publishCollectionTask() },
  async loadMore() {}, async refreshCompletedList() {},
  start(selectedIds: string[]) {
    const total = selectedIds.length
    collectionTask = { ...collectionTask, state: 'running', mode: 'selected', counts: { ...collectionTask.counts, selected: total }, progress: { completed: 0, total }, message: 'Offline collection fixture is running.' }
    publishCollectionTask()
    setTimeout(() => {
      collectionTask = { ...collectionTask, state: 'completed', videos: collectionTask.videos.map((item) => selectedIds.includes(item.id) ? { ...item, status: 'completed' } : item), counts: { ...collectionTask.counts, completed: total, failed: 0 }, progress: { completed: total, total }, message: 'Offline collection fixture completed.' }
      account = { ...account, collectedVideosCount: Math.max(0, (account.collectedVideosCount ?? 0) - total) }
      publishCollectionTask()
      mainWindow?.webContents.send(DOUYIN_IPC_CHANNELS.account, account)
    }, 30)
  },
  async startAll(limit?: number) { this.start(collectionTask.videos.slice(0, limit ?? collectionTask.videos.length).map((item) => item.id)) },
  pause() { if (collectionTask.state === 'running') { collectionTask = { ...collectionTask, state: 'paused' }; publishCollectionTask() } },
  resume() { if (collectionTask.state === 'paused') { collectionTask = { ...collectionTask, state: 'running' }; publishCollectionTask() } },
  stop() { collectionTask = { ...collectionTask, state: 'stopped' }; publishCollectionTask() },
  async signOut() {},
  resetForSignOut() {
    collectionTask = { ...collectionTask, state: 'idle', videos: [], counts: { loaded: 0, selected: 0, completed: 0, failed: 0 }, progress: { completed: 0, total: 0 } }
    publishCollectionTask()
  },
}

const followingController = {
  getSnapshot: () => followingTask,
  async scan() { publishFollowingTask() },
  async loadMore() {},
  async refreshCompletedList() {},
  start(selectedIds: string[]) {
    const total = selectedIds.length
    if (scenario === 'following-error') {
      followingTask = {
        ...followingTask,
        state: 'paused',
        mode: 'selected',
        accounts: followingTask.accounts.map((item) => selectedIds.includes(item.id) ? { ...item, status: 'failed' } : item),
        counts: { ...followingTask.counts, selected: total, failed: 1 },
        progress: { completed: 0, total },
        message: 'Douyin API request was rejected: offline unfollow fixture failure',
      }
      publishFollowingTask()
      return
    }
    followingTask = {
      ...followingTask,
      state: 'running',
      mode: 'selected',
      counts: { ...followingTask.counts, selected: total },
      progress: { completed: 0, total },
      message: 'Offline unfollow fixture is running.',
    }
    publishFollowingTask()
    setTimeout(() => {
      followingTask = {
        ...followingTask,
        state: 'completed',
        accounts: followingTask.accounts.map((item) => selectedIds.includes(item.id) ? { ...item, status: 'completed' } : item),
        counts: { ...followingTask.counts, completed: total, failed: 0 },
        progress: { completed: total, total },
        message: 'Offline unfollow fixture completed.',
      }
      account = { ...account, followingCount: Math.max(0, (account.followingCount ?? 0) - total) }
      publishFollowingTask()
      mainWindow?.webContents.send(DOUYIN_IPC_CHANNELS.account, account)
    }, 30)
  },
  async startAll(limit?: number) {
    const target = limit ?? followingTask.accounts.length
    return this.start(followingTask.accounts.slice(0, target).map((item) => item.id))
  },
  pause() {
    if (followingTask.state !== 'running') return
    followingTask = { ...followingTask, state: 'paused' }
    publishFollowingTask()
  },
  resume() {
    if (followingTask.state !== 'paused') return
    followingTask = { ...followingTask, state: 'running' }
    publishFollowingTask()
  },
  stop() {
    followingTask = { ...followingTask, state: 'stopped' }
    publishFollowingTask()
  },
  resetForSignOut() {
    followingTask = { ...followingTask, state: 'idle', accounts: [], counts: { loaded: 0, selected: 0, completed: 0, failed: 0 }, progress: { completed: 0, total: 0 } }
    publishFollowingTask()
  },
}

registerDouyinIpcHandlers(ipcMain, likedVideoController, followingController, collectionController)

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => {
    externalRequestCount += 1
    callback({ cancel: true })
  })

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 560,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(projectRoot, 'dist-electron', 'preload.mjs'),
    },
  })
  await mainWindow.loadFile(join(projectRoot, 'dist', 'index.html'))
})

app.on('window-all-closed', () => app.quit())

Object.assign(globalThis, {
  getEbbExternalRequestCount: () => externalRequestCount,
})
