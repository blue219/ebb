import type { IpcRenderer } from 'electron'

import type {
  AccountSnapshot,
  DouyinBridge,
  LoginSnapshot,
  TaskSnapshot,
} from '../../../shared/platforms/douyin/contracts.js'

export function createDouyinBridge(ipcRenderer: IpcRenderer): DouyinBridge {
  return {
    getState: () => ipcRenderer.invoke('douyin:get-state'),
    showLogin: () => ipcRenderer.invoke('douyin:show-login'),
    refreshLogin: () => ipcRenderer.invoke('douyin:refresh-login'),
    hideLogin: () => ipcRenderer.invoke('douyin:hide-login'),
    scan: () => ipcRenderer.invoke('douyin:scan'),
    loadMore: () => ipcRenderer.invoke('douyin:load-more'),
    start: (selectedIds: string[]) => ipcRenderer.invoke('douyin:start', selectedIds),
    startAll: (limit?: number) => ipcRenderer.invoke('douyin:start-all', limit),
    pause: () => ipcRenderer.invoke('douyin:pause'),
    resume: (selectedIds: string[]) => ipcRenderer.invoke('douyin:resume', selectedIds),
    stop: () => ipcRenderer.invoke('douyin:stop'),
    signOut: () => ipcRenderer.invoke('douyin:sign-out'),
    onStatus: (callback: (snapshot: TaskSnapshot) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, snapshot: TaskSnapshot) => callback(snapshot)
      ipcRenderer.on('douyin:status', listener)
      return () => ipcRenderer.removeListener('douyin:status', listener)
    },
    onAccount: (callback: (snapshot: AccountSnapshot) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, snapshot: AccountSnapshot) => callback(snapshot)
      ipcRenderer.on('douyin:account', listener)
      return () => ipcRenderer.removeListener('douyin:account', listener)
    },
    onLogin: (callback: (snapshot: LoginSnapshot) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, snapshot: LoginSnapshot) => callback(snapshot)
      ipcRenderer.on('douyin:login', listener)
      return () => ipcRenderer.removeListener('douyin:login', listener)
    },
  }
}
