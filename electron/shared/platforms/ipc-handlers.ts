import type { IpcMain } from 'electron'

import type { PlatformIpcChannels } from '../../../shared/platforms/contracts.js'
import type { PlatformFollowingTaskService } from './following-task-service.js'
import type { PlatformTaskService } from './task-service.js'

export type TaskController = Pick<
  PlatformTaskService,
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

export type FollowingController = Pick<
  PlatformFollowingTaskService,
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

export function registerPlatformIpcHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  channels: PlatformIpcChannels,
  task: TaskController,
  following: FollowingController,
  collection: TaskController,
  ensureInitialized: () => Promise<void> = async () => {},
) {
  ipc.handle(channels.getState, async () => {
    await ensureInitialized()
    return {
      task: task.getTaskSnapshot(),
      followingTask: following.getSnapshot(),
      collectionTask: collection.getTaskSnapshot(),
      account: task.getAccountSnapshot(),
      login: task.getLoginSnapshot(),
    }
  })
  ipc.handle(channels.showLogin, () => task.showLogin())
  ipc.handle(channels.refreshLogin, () => task.refreshLogin())
  ipc.handle(channels.hideLogin, () => task.hideLogin())
  ipc.handle(channels.scan, () => task.scan())
  ipc.handle(channels.loadMore, () => task.loadMore())
  ipc.handle(channels.refreshCompletedList, () => task.refreshCompletedList())
  ipc.handle(channels.start, (_event, selectedIds: string[]) => task.start(selectedIds))
  ipc.handle(channels.startAll, (_event, limit?: number) => task.startAll(limit))
  ipc.handle(channels.pause, () => task.pause())
  ipc.handle(channels.resume, (_event, selectedIds: string[]) => task.resume(selectedIds))
  ipc.handle(channels.stop, () => task.stop())
  ipc.handle(channels.signOut, () => {
    following.resetForSignOut()
    collection.resetForSignOut()
    return task.signOut()
  })
  ipc.handle(channels.following.scan, () => following.scan())
  ipc.handle(channels.following.loadMore, () => following.loadMore())
  ipc.handle(channels.following.refreshCompletedList, () => following.refreshCompletedList())
  ipc.handle(channels.following.start, (_event, selectedIds: string[]) => following.start(selectedIds))
  ipc.handle(channels.following.startAll, (_event, limit?: number) => following.startAll(limit))
  ipc.handle(channels.following.pause, () => following.pause())
  ipc.handle(channels.following.resume, (_event, selectedIds: string[]) => following.resume(selectedIds))
  ipc.handle(channels.following.stop, () => following.stop())
  ipc.handle(channels.collection.scan, () => collection.scan())
  ipc.handle(channels.collection.loadMore, () => collection.loadMore())
  ipc.handle(channels.collection.refreshCompletedList, () => collection.refreshCompletedList())
  ipc.handle(channels.collection.start, (_event, selectedIds: string[]) => collection.start(selectedIds))
  ipc.handle(channels.collection.startAll, (_event, limit?: number) => collection.startAll(limit))
  ipc.handle(channels.collection.pause, () => collection.pause())
  ipc.handle(channels.collection.resume, (_event, selectedIds: string[]) => collection.resume(selectedIds))
  ipc.handle(channels.collection.stop, () => collection.stop())
}
