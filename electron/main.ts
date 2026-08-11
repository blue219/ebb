import { app, BrowserWindow, ipcMain } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DouyinTaskService } from './douyin.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
let mainWindow: BrowserWindow | undefined

const douyin = new DouyinTaskService((snapshot) => {
  mainWindow?.webContents.send('douyin:status', snapshot)
})

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(currentDirectory, 'preload.mjs'),
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    return
  }

  void mainWindow.loadFile(join(currentDirectory, '../dist/index.html'))
}

ipcMain.handle('douyin:open', () => douyin.openWorkWindow())
ipcMain.handle('douyin:scan', () => douyin.scan())
ipcMain.handle('douyin:start', (_event, selectedIds: string[]) => douyin.start(selectedIds))
ipcMain.handle('douyin:pause', () => douyin.pause())
ipcMain.handle('douyin:resume', (_event, selectedIds: string[]) => douyin.resume(selectedIds))
ipcMain.handle('douyin:stop', () => douyin.stop())
ipcMain.handle('douyin:sign-out', () => douyin.signOut())

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
