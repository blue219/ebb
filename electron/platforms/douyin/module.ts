import { ipcMain, type BrowserWindow } from 'electron'

import { DOUYIN_IPC_CHANNELS } from '../../../shared/platforms/douyin/contracts.js'
import { ElectronDouyinClient } from './electron-client.js'
import { registerDouyinIpcHandlers } from './ipc-handlers.js'
import { DouyinTaskService } from './task-service.js'

export function createDouyinPlatformModule(getHostWindow: () => BrowserWindow | undefined) {
  const client = new ElectronDouyinClient(getHostWindow)
  const taskService = new DouyinTaskService(client, (snapshot) => {
    getHostWindow()?.webContents.send(DOUYIN_IPC_CHANNELS.status, snapshot)
  }, (account) => {
    getHostWindow()?.webContents.send(DOUYIN_IPC_CHANNELS.account, account)
  }, (login) => {
    getHostWindow()?.webContents.send(DOUYIN_IPC_CHANNELS.login, login)
  })

  registerDouyinIpcHandlers(ipcMain, taskService)

  return {
    initialize: (_hostWindow: BrowserWindow) => taskService.initialize(),
    dispose: () => taskService.dispose(),
  }
}
