import type { IpcMain } from 'electron'

import { DOUYIN_IPC_CHANNELS } from '../../../shared/platforms/douyin/contracts.js'
import {
  registerPlatformIpcHandlers,
  type FollowingController,
  type TaskController,
} from '../../shared/platforms/ipc-handlers.js'

export const registerDouyinIpcHandlers = (
  ipc: Pick<IpcMain, 'handle'>,
  task: TaskController,
  following: FollowingController,
  collection: TaskController,
  ensureInitialized?: () => Promise<void>,
) => registerPlatformIpcHandlers(
  ipc,
  DOUYIN_IPC_CHANNELS,
  task,
  following,
  collection,
  ensureInitialized,
)
