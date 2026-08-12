import { app, BrowserWindow, ipcMain, session } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
  AccountSnapshot,
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
let account: AccountSnapshot = { state: 'signedIn', name: 'Offline tester', likesCount: 2 }
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
}

const publishTask = () => mainWindow?.webContents.send(DOUYIN_IPC_CHANNELS.status, task)
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

registerDouyinIpcHandlers(ipcMain, {
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
  start(selectedIds: string[]) { beginTask('selected', selectedIds.length) },
  async startAll(limit?: number) { beginTask(limit === undefined ? 'all' : 'limited', limit ?? account.likesCount ?? 0) },
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
      account = { ...account, likesCount: Math.max(0, (account.likesCount ?? 0) - completed) }
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
})

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
