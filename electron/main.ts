import { app, BrowserWindow } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createDouyinPlatformModule } from './platforms/douyin/module.js'
import { createTikTokPlatformModule } from './platforms/tiktok/module.js'
import { PlatformMutationCoordinator } from './shared/platforms/mutation-coordinator.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
let mainWindow: BrowserWindow | undefined

const mutationCoordinator = new PlatformMutationCoordinator()
const douyin = createDouyinPlatformModule(() => mainWindow, mutationCoordinator)
const tiktok = createTikTokPlatformModule(() => mainWindow, mutationCoordinator)

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 560,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(currentDirectory, 'preload.mjs'),
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void mainWindow.loadFile(join(currentDirectory, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  douyin.dispose()
  tiktok.dispose()
})
