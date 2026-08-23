import type { IpcRenderer } from 'electron'

import type {
  AccountSnapshot,
  FollowingTaskSnapshot,
  LoginSnapshot,
  PlatformBridge,
  PlatformIpcChannels,
  TaskSnapshot,
} from '../../../shared/platforms/contracts.js'

export function createPlatformBridge(ipcRenderer: IpcRenderer, channels: PlatformIpcChannels): PlatformBridge {
  const listen = <T>(channel: string, callback: (snapshot: T) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: T) => callback(snapshot)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }

  return {
    getState: () => ipcRenderer.invoke(channels.getState),
    showLogin: () => ipcRenderer.invoke(channels.showLogin),
    refreshLogin: () => ipcRenderer.invoke(channels.refreshLogin),
    hideLogin: () => ipcRenderer.invoke(channels.hideLogin),
    scan: () => ipcRenderer.invoke(channels.scan),
    loadMore: () => ipcRenderer.invoke(channels.loadMore),
    refreshCompletedList: () => ipcRenderer.invoke(channels.refreshCompletedList),
    start: (selectedIds) => ipcRenderer.invoke(channels.start, selectedIds),
    startAll: (limit) => ipcRenderer.invoke(channels.startAll, limit),
    pause: () => ipcRenderer.invoke(channels.pause),
    resume: (selectedIds) => ipcRenderer.invoke(channels.resume, selectedIds),
    stop: () => ipcRenderer.invoke(channels.stop),
    signOut: () => ipcRenderer.invoke(channels.signOut),
    onStatus: (callback) => listen<TaskSnapshot>(channels.status, callback),
    onAccount: (callback) => listen<AccountSnapshot>(channels.account, callback),
    onLogin: (callback) => listen<LoginSnapshot>(channels.login, callback),
    following: {
      scan: () => ipcRenderer.invoke(channels.following.scan),
      loadMore: () => ipcRenderer.invoke(channels.following.loadMore),
      refreshCompletedList: () => ipcRenderer.invoke(channels.following.refreshCompletedList),
      start: (selectedIds) => ipcRenderer.invoke(channels.following.start, selectedIds),
      startAll: (limit) => ipcRenderer.invoke(channels.following.startAll, limit),
      pause: () => ipcRenderer.invoke(channels.following.pause),
      resume: (selectedIds) => ipcRenderer.invoke(channels.following.resume, selectedIds),
      stop: () => ipcRenderer.invoke(channels.following.stop),
      onStatus: (callback) => listen<FollowingTaskSnapshot>(channels.following.status, callback),
    },
    collection: {
      scan: () => ipcRenderer.invoke(channels.collection.scan),
      loadMore: () => ipcRenderer.invoke(channels.collection.loadMore),
      refreshCompletedList: () => ipcRenderer.invoke(channels.collection.refreshCompletedList),
      start: (selectedIds) => ipcRenderer.invoke(channels.collection.start, selectedIds),
      startAll: (limit) => ipcRenderer.invoke(channels.collection.startAll, limit),
      pause: () => ipcRenderer.invoke(channels.collection.pause),
      resume: (selectedIds) => ipcRenderer.invoke(channels.collection.resume, selectedIds),
      stop: () => ipcRenderer.invoke(channels.collection.stop),
      onStatus: (callback) => listen<TaskSnapshot>(channels.collection.status, callback),
    },
  }
}
