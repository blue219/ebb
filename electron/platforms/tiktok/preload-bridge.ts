import type { IpcRenderer } from 'electron'

import { TIKTOK_IPC_CHANNELS } from '../../../shared/platforms/tiktok/contracts.js'
import { createPlatformBridge } from '../../shared/platforms/preload-bridge.js'

export const createTikTokBridge = (ipcRenderer: IpcRenderer) => (
  createPlatformBridge(ipcRenderer, TIKTOK_IPC_CHANNELS)
)
