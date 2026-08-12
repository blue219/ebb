import { contextBridge, ipcRenderer } from 'electron'

import { createDouyinBridge } from './platforms/douyin/preload-bridge.js'

contextBridge.exposeInMainWorld('ebb', {
  platform: process.platform,
  douyin: createDouyinBridge(ipcRenderer),
})
