import { ipcMain, type BrowserWindow } from 'electron'

import { DOUYIN_IPC_CHANNELS } from '../../../shared/platforms/douyin/contracts.js'
import { ElectronDouyinClient } from './electron-client.js'
import { DouyinFollowingTaskService } from './following-task-service.js'
import { registerDouyinIpcHandlers } from './ipc-handlers.js'
import { DouyinTaskService } from './task-service.js'
import { DouyinMutationCoordinator } from './mutation-coordinator.js'

export function createDouyinPlatformModule(getHostWindow: () => BrowserWindow | undefined) {
  const client = new ElectronDouyinClient(getHostWindow)
  const mutationCoordinator = new DouyinMutationCoordinator()
  const taskService = new DouyinTaskService(client, (snapshot) => {
    getHostWindow()?.webContents.send(DOUYIN_IPC_CHANNELS.status, snapshot)
  }, (account) => {
    getHostWindow()?.webContents.send(DOUYIN_IPC_CHANNELS.account, account)
  }, (login) => {
    getHostWindow()?.webContents.send(DOUYIN_IPC_CHANNELS.login, login)
  }, undefined, mutationCoordinator)
  const followingTaskService = new DouyinFollowingTaskService(
    client,
    {
      getSnapshot: () => taskService.getAccountSnapshot(),
      requireSignedInUserId: () => taskService.requireSignedInUserId(),
      decrementFollowingCount: () => taskService.decrementFollowingCount(),
    },
    mutationCoordinator,
    (snapshot) => {
      getHostWindow()?.webContents.send(DOUYIN_IPC_CHANNELS.following.status, snapshot)
    },
  )
  const stopFollowingCrashListener = client.onWorkspaceCrash(() => followingTaskService.handleWorkspaceCrash())

  registerDouyinIpcHandlers(ipcMain, taskService, followingTaskService)

  return {
    initialize: (_hostWindow: BrowserWindow) => taskService.initialize(),
    dispose: () => {
      stopFollowingCrashListener()
      followingTaskService.dispose()
      taskService.dispose()
    },
  }
}
