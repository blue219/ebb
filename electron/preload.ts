import { contextBridge, ipcRenderer } from 'electron'

import { createDouyinBridge } from './platforms/douyin/preload-bridge.js'
import { createTikTokBridge } from './platforms/tiktok/preload-bridge.js'
import { SPACEX_OPEN_MISSION, type SpaceXBridge } from '../shared/spacex.js'

contextBridge.exposeInMainWorld('ebb', {
  platform: process.platform,
  douyin: createDouyinBridge(ipcRenderer),
  tiktok: createTikTokBridge(ipcRenderer),
  spacex: { openMission: (slug: string) => ipcRenderer.invoke(SPACEX_OPEN_MISSION, slug) } satisfies SpaceXBridge,
})
