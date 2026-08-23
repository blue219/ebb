import type { IpcRenderer } from 'electron'

import { DOUYIN_IPC_CHANNELS } from '../../../shared/platforms/douyin/contracts.js'
import { createPlatformBridge } from '../../shared/platforms/preload-bridge.js'

export const createDouyinBridge = (ipcRenderer: IpcRenderer) => (
  createPlatformBridge(ipcRenderer, DOUYIN_IPC_CHANNELS)
)
