import { ipcMain, type BrowserWindow } from 'electron'

import { DouyinTaskService } from './task-service.js'

export function createDouyinPlatformModule(getHostWindow: () => BrowserWindow | undefined) {
  const taskService = new DouyinTaskService((snapshot) => {
    getHostWindow()?.webContents.send('douyin:status', snapshot)
  }, (account) => {
    getHostWindow()?.webContents.send('douyin:account', account)
  }, (login) => {
    getHostWindow()?.webContents.send('douyin:login', login)
  })

  ipcMain.handle('douyin:get-state', () => ({
    task: taskService.getTaskSnapshot(),
    account: taskService.getAccountSnapshot(),
    login: taskService.getLoginSnapshot(),
  }))
  ipcMain.handle('douyin:show-login', () => taskService.showLogin())
  ipcMain.handle('douyin:refresh-login', () => taskService.refreshLogin())
  ipcMain.handle('douyin:hide-login', () => taskService.hideLogin())
  ipcMain.handle('douyin:scan', () => taskService.scan())
  ipcMain.handle('douyin:load-more', () => taskService.loadMore())
  ipcMain.handle('douyin:start', (_event, selectedIds: string[]) => taskService.start(selectedIds))
  ipcMain.handle('douyin:start-all', (_event, limit?: number) => taskService.startAll(limit))
  ipcMain.handle('douyin:pause', () => taskService.pause())
  ipcMain.handle('douyin:resume', (_event, selectedIds: string[]) => taskService.resume(selectedIds))
  ipcMain.handle('douyin:stop', () => taskService.stop())
  ipcMain.handle('douyin:sign-out', () => taskService.signOut())

  return {
    initialize: (hostWindow: BrowserWindow) => taskService.initialize(hostWindow),
    dispose: () => taskService.dispose(),
  }
}
