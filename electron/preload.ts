import { contextBridge, ipcRenderer } from 'electron'

import type { TaskSnapshot } from './douyin.js'

contextBridge.exposeInMainWorld('ebb', {
  platform: process.platform,
  douyin: {
    open: () => ipcRenderer.invoke('douyin:open'),
    scan: () => ipcRenderer.invoke('douyin:scan'),
    start: (selectedIds: string[]) => ipcRenderer.invoke('douyin:start', selectedIds),
    pause: () => ipcRenderer.invoke('douyin:pause'),
    resume: (selectedIds: string[]) => ipcRenderer.invoke('douyin:resume', selectedIds),
    stop: () => ipcRenderer.invoke('douyin:stop'),
    signOut: () => ipcRenderer.invoke('douyin:sign-out'),
    onStatus: (callback: (snapshot: TaskSnapshot) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, snapshot: TaskSnapshot) => callback(snapshot)
      ipcRenderer.on('douyin:status', listener)
      return () => ipcRenderer.removeListener('douyin:status', listener)
    },
  },
})
