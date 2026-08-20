import type { IpcRenderer } from 'electron'

import { DOUYIN_IPC_CHANNELS } from '../../../shared/platforms/douyin/contracts.js'
import type {
  AccountSnapshot,
  DouyinBridge,
  LoginSnapshot,
  FollowingTaskSnapshot,
  TaskSnapshot,
} from '../../../shared/platforms/douyin/contracts.js'

export function createDouyinBridge(ipcRenderer: IpcRenderer): DouyinBridge {
  return {
    getState: () => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.getState),
    showLogin: () => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.showLogin),
    refreshLogin: () => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.refreshLogin),
    hideLogin: () => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.hideLogin),
    scan: () => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.scan),
    loadMore: () => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.loadMore),
    refreshCompletedList: () => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.refreshCompletedList),
    start: (selectedIds: string[]) => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.start, selectedIds),
    startAll: (limit?: number) => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.startAll, limit),
    pause: () => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.pause),
    resume: (selectedIds: string[]) => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.resume, selectedIds),
    stop: () => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.stop),
    signOut: () => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.signOut),
    onStatus: (callback: (snapshot: TaskSnapshot) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, snapshot: TaskSnapshot) => callback(snapshot)
      ipcRenderer.on(DOUYIN_IPC_CHANNELS.status, listener)
      return () => ipcRenderer.removeListener(DOUYIN_IPC_CHANNELS.status, listener)
    },
    onAccount: (callback: (snapshot: AccountSnapshot) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, snapshot: AccountSnapshot) => callback(snapshot)
      ipcRenderer.on(DOUYIN_IPC_CHANNELS.account, listener)
      return () => ipcRenderer.removeListener(DOUYIN_IPC_CHANNELS.account, listener)
    },
    onLogin: (callback: (snapshot: LoginSnapshot) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, snapshot: LoginSnapshot) => callback(snapshot)
      ipcRenderer.on(DOUYIN_IPC_CHANNELS.login, listener)
      return () => ipcRenderer.removeListener(DOUYIN_IPC_CHANNELS.login, listener)
    },
    following: {
      scan: () => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.following.scan),
      loadMore: () => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.following.loadMore),
      refreshCompletedList: () => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.following.refreshCompletedList),
      start: (selectedIds: string[]) => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.following.start, selectedIds),
      startAll: (limit?: number) => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.following.startAll, limit),
      pause: () => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.following.pause),
      resume: (selectedIds: string[]) => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.following.resume, selectedIds),
      stop: () => ipcRenderer.invoke(DOUYIN_IPC_CHANNELS.following.stop),
      onStatus: (callback: (snapshot: FollowingTaskSnapshot) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, snapshot: FollowingTaskSnapshot) => callback(snapshot)
        ipcRenderer.on(DOUYIN_IPC_CHANNELS.following.status, listener)
        return () => ipcRenderer.removeListener(DOUYIN_IPC_CHANNELS.following.status, listener)
      },
    },
  }
}
