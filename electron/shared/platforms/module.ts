import { ipcMain, type BrowserWindow } from 'electron'

import type { PlatformIpcChannels } from '../../../shared/platforms/contracts.js'
import type { PlatformClient, PlatformRuntimeConfig } from './client.js'
import { PlatformFollowingTaskService } from './following-task-service.js'
import { registerPlatformIpcHandlers } from './ipc-handlers.js'
import { PlatformMutationCoordinator } from './mutation-coordinator.js'
import { PlatformTaskService } from './task-service.js'

interface PlatformModuleOptions {
  channels: PlatformIpcChannels
  client: PlatformClient
  getHostWindow: () => BrowserWindow | undefined
  mutationCoordinator: PlatformMutationCoordinator
  runtime: PlatformRuntimeConfig
}

export function createPlatformModule(options: PlatformModuleOptions) {
  const { channels, client, getHostWindow, mutationCoordinator, runtime } = options
  const send = (channel: string, snapshot: unknown) => getHostWindow()?.webContents.send(channel, snapshot)
  const task = new PlatformTaskService(
    client,
    (snapshot) => send(channels.status, snapshot),
    (account) => send(channels.account, account),
    (login) => send(channels.login, login),
    undefined,
    mutationCoordinator,
    { runtime },
  )
  const following = new PlatformFollowingTaskService(
    client,
    {
      getSnapshot: () => task.getAccountSnapshot(),
      requireSignedInUserId: () => task.requireSignedInUserId(),
      decrementFollowingCount: () => task.decrementFollowingCount(),
    },
    mutationCoordinator,
    (snapshot) => send(channels.following.status, snapshot),
    undefined,
    runtime,
  )
  const collection = new PlatformTaskService(
    client,
    (snapshot) => send(channels.collection.status, snapshot),
    (account) => send(channels.account, account),
    () => {},
    undefined,
    mutationCoordinator,
    { kind: 'collections', ownsClient: false, runtime },
  )
  const stopFollowingCrashListener = client.onWorkspaceCrash(() => following.handleWorkspaceCrash())
  const stopCollectionCrashListener = client.onWorkspaceCrash(() => collection.handleWorkspaceCrash())
  let initialization: Promise<void> | undefined

  const ensureInitialized = () => {
    if (!initialization) {
      initialization = task.initialize().catch((error: unknown) => {
        initialization = undefined
        throw error
      })
    }
    return initialization
  }

  registerPlatformIpcHandlers(ipcMain, channels, task, following, collection, ensureInitialized)

  return {
    initialize: ensureInitialized,
    dispose: () => {
      stopFollowingCrashListener()
      stopCollectionCrashListener()
      following.dispose()
      collection.dispose()
      task.dispose()
    },
  }
}
