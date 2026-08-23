import type { IpcMain } from 'electron'

import { DOUYIN_IPC_CHANNELS } from '../../../shared/platforms/douyin/contracts.js'
import type { DouyinTaskService } from './task-service.js'
import type { DouyinFollowingTaskService } from './following-task-service.js'

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
  | 'resetForSignOut'
>

type FollowingController = Pick<
  DouyinFollowingTaskService,
  | 'getSnapshot'
  | 'scan'
  | 'loadMore'
  | 'refreshCompletedList'
  | 'start'
  | 'startAll'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'resetForSignOut'
>

export function registerDouyinIpcHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  task: TaskController,
  following: FollowingController,
  collection: TaskController,
) {
  ipc.handle(DOUYIN_IPC_CHANNELS.getState, () => ({
    task: task.getTaskSnapshot(),
    followingTask: following.getSnapshot(),
    collectionTask: collection.getTaskSnapshot(),
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
  ipc.handle(DOUYIN_IPC_CHANNELS.signOut, () => {
    following.resetForSignOut()
    collection.resetForSignOut()
    return task.signOut()
  })
  ipc.handle(DOUYIN_IPC_CHANNELS.following.scan, () => following.scan())
  ipc.handle(DOUYIN_IPC_CHANNELS.following.loadMore, () => following.loadMore())
  ipc.handle(DOUYIN_IPC_CHANNELS.following.refreshCompletedList, () => following.refreshCompletedList())
  ipc.handle(DOUYIN_IPC_CHANNELS.following.start, (_event, selectedIds: string[]) => following.start(selectedIds))
  ipc.handle(DOUYIN_IPC_CHANNELS.following.startAll, (_event, limit?: number) => following.startAll(limit))
  ipc.handle(DOUYIN_IPC_CHANNELS.following.pause, () => following.pause())
  ipc.handle(DOUYIN_IPC_CHANNELS.following.resume, (_event, selectedIds: string[]) => following.resume(selectedIds))
  ipc.handle(DOUYIN_IPC_CHANNELS.following.stop, () => following.stop())
  ipc.handle(DOUYIN_IPC_CHANNELS.collection.scan, () => collection.scan())
  ipc.handle(DOUYIN_IPC_CHANNELS.collection.loadMore, () => collection.loadMore())
  ipc.handle(DOUYIN_IPC_CHANNELS.collection.refreshCompletedList, () => collection.refreshCompletedList())
  ipc.handle(DOUYIN_IPC_CHANNELS.collection.start, (_event, selectedIds: string[]) => collection.start(selectedIds))
  ipc.handle(DOUYIN_IPC_CHANNELS.collection.startAll, (_event, limit?: number) => collection.startAll(limit))
  ipc.handle(DOUYIN_IPC_CHANNELS.collection.pause, () => collection.pause())
  ipc.handle(DOUYIN_IPC_CHANNELS.collection.resume, (_event, selectedIds: string[]) => collection.resume(selectedIds))
  ipc.handle(DOUYIN_IPC_CHANNELS.collection.stop, () => collection.stop())
}
