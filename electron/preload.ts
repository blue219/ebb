import { contextBridge, ipcRenderer } from 'electron'

import { createDouyinBridge } from './platforms/douyin/preload-bridge.js'
import { createTikTokBridge } from './platforms/tiktok/preload-bridge.js'

contextBridge.exposeInMainWorld('ebb', {
  platform: process.platform,
  douyin: createDouyinBridge(ipcRenderer),
  tiktok: createTikTokBridge(ipcRenderer),
})
