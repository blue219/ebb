import type { IpcMain } from 'electron'

import { TIKTOK_IPC_CHANNELS } from '../../../shared/platforms/tiktok/contracts.js'
import { registerPlatformIpcHandlers } from '../../shared/platforms/ipc-handlers.js'
import type { PlatformFollowingTaskService } from '../../shared/platforms/following-task-service.js'
import type { PlatformTaskService } from '../../shared/platforms/task-service.js'

export const registerTikTokIpcHandlers = (
  ipc: Pick<IpcMain, 'handle'>,
  task: PlatformTaskService,
  following: PlatformFollowingTaskService,
  collection: PlatformTaskService,
  ensureInitialized?: () => Promise<void>,
) => registerPlatformIpcHandlers(
  ipc,
  TIKTOK_IPC_CHANNELS,
  task,
  following,
  collection,
  ensureInitialized,
)
