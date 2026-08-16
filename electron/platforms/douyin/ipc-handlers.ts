import type { IpcMain } from 'electron'

import { DOUYIN_IPC_CHANNELS } from '../../../shared/platforms/douyin/contracts.js'
import type { DouyinTaskService } from './task-service.js'

type TaskController = Pick<
  DouyinTaskService,
  | 'getTaskSnapshot'
  | 'getAccountSnapshot'
  | 'getLoginSnapshot'
  | 'showLogin'
  | 'refreshLogin'
  | 'hideLogin'
  | 'scan'
  | 'loadMore'
  | 'refreshCompletedList'
  | 'start'
  | 'startAll'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'signOut'
>

export function registerDouyinIpcHandlers(ipc: Pick<IpcMain, 'handle'>, task: TaskController) {
  ipc.handle(DOUYIN_IPC_CHANNELS.getState, () => ({
    task: task.getTaskSnapshot(),
    account: task.getAccountSnapshot(),
    login: task.getLoginSnapshot(),
  }))
  ipc.handle(DOUYIN_IPC_CHANNELS.showLogin, () => task.showLogin())
  ipc.handle(DOUYIN_IPC_CHANNELS.refreshLogin, () => task.refreshLogin())
  ipc.handle(DOUYIN_IPC_CHANNELS.hideLogin, () => task.hideLogin())
  ipc.handle(DOUYIN_IPC_CHANNELS.scan, () => task.scan())
  ipc.handle(DOUYIN_IPC_CHANNELS.loadMore, () => task.loadMore())
  ipc.handle(DOUYIN_IPC_CHANNELS.refreshCompletedList, () => task.refreshCompletedList())
  ipc.handle(DOUYIN_IPC_CHANNELS.start, (_event, selectedIds: string[]) => task.start(selectedIds))
  ipc.handle(DOUYIN_IPC_CHANNELS.startAll, (_event, limit?: number) => task.startAll(limit))
  ipc.handle(DOUYIN_IPC_CHANNELS.pause, () => task.pause())
  ipc.handle(DOUYIN_IPC_CHANNELS.resume, (_event, selectedIds: string[]) => task.resume(selectedIds))
  ipc.handle(DOUYIN_IPC_CHANNELS.stop, () => task.stop())
  ipc.handle(DOUYIN_IPC_CHANNELS.signOut, () => task.signOut())
}
