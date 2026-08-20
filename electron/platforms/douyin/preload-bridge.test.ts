import type { IpcRenderer } from 'electron'
import { describe, expect, test, vi } from 'vitest'

import {
  DOUYIN_IPC_CHANNELS,
  type AccountSnapshot,
  type LoginSnapshot,
  type TaskSnapshot,
} from '../../../shared/platforms/douyin/contracts.ts'
import { createDouyinBridge } from './preload-bridge.ts'

describe('Douyin preload bridge', () => {
  test('maps commands to platform-namespaced IPC channels', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const ipc = { invoke, on: vi.fn(), removeListener: vi.fn() } as unknown as IpcRenderer
    const bridge = createDouyinBridge(ipc)

    await bridge.getState()
    await bridge.showLogin()
    await bridge.refreshLogin()
    await bridge.hideLogin()
    await bridge.scan()
    await bridge.loadMore()
    await bridge.refreshCompletedList()
    await bridge.start(['1'])
    await bridge.startAll(5)
    await bridge.pause()
    await bridge.resume(['2'])
    await bridge.stop()
    await bridge.signOut()
    await bridge.following.scan()
    await bridge.following.loadMore()
    await bridge.following.refreshCompletedList()
    await bridge.following.start(['account-1'])
    await bridge.following.startAll(5)
    await bridge.following.pause()
    await bridge.following.resume(['account-2'])
    await bridge.following.stop()

    expect(invoke.mock.calls).toEqual([
      [DOUYIN_IPC_CHANNELS.getState],
      [DOUYIN_IPC_CHANNELS.showLogin],
      [DOUYIN_IPC_CHANNELS.refreshLogin],
      [DOUYIN_IPC_CHANNELS.hideLogin],
      [DOUYIN_IPC_CHANNELS.scan],
      [DOUYIN_IPC_CHANNELS.loadMore],
      [DOUYIN_IPC_CHANNELS.refreshCompletedList],
      [DOUYIN_IPC_CHANNELS.start, ['1']],
      [DOUYIN_IPC_CHANNELS.startAll, 5],
      [DOUYIN_IPC_CHANNELS.pause],
      [DOUYIN_IPC_CHANNELS.resume, ['2']],
      [DOUYIN_IPC_CHANNELS.stop],
      [DOUYIN_IPC_CHANNELS.signOut],
      [DOUYIN_IPC_CHANNELS.following.scan],
      [DOUYIN_IPC_CHANNELS.following.loadMore],
      [DOUYIN_IPC_CHANNELS.following.refreshCompletedList],
      [DOUYIN_IPC_CHANNELS.following.start, ['account-1']],
      [DOUYIN_IPC_CHANNELS.following.startAll, 5],
      [DOUYIN_IPC_CHANNELS.following.pause],
      [DOUYIN_IPC_CHANNELS.following.resume, ['account-2']],
      [DOUYIN_IPC_CHANNELS.following.stop],
    ])
  })

  test('forwards event payloads and removes the exact listener', () => {
    type Listener = (event: Electron.IpcRendererEvent, ...args: unknown[]) => void
    const listeners = new Map<string, Listener>()
    const removeListener = vi.fn()
    const ipc = {
      invoke: vi.fn(),
      on: vi.fn((channel: string, listener: Listener) => {
        listeners.set(channel, listener)
      }),
      removeListener,
    } as unknown as IpcRenderer
    const bridge = createDouyinBridge(ipc)
    const status = vi.fn()
    const account = vi.fn()
    const login = vi.fn()
    const followingStatus = vi.fn()
    const stopStatus = bridge.onStatus(status)
    const stopAccount = bridge.onAccount(account)
    const stopLogin = bridge.onLogin(login)
    const stopFollowingStatus = bridge.following.onStatus(followingStatus)

    const taskPayload = { state: 'ready' } as TaskSnapshot
    const accountPayload = { state: 'signedIn' } as AccountSnapshot
    const loginPayload = { state: 'ready' } as LoginSnapshot
    listeners.get(DOUYIN_IPC_CHANNELS.status)?.({} as Electron.IpcRendererEvent, taskPayload)
    listeners.get(DOUYIN_IPC_CHANNELS.account)?.({} as Electron.IpcRendererEvent, accountPayload)
    listeners.get(DOUYIN_IPC_CHANNELS.login)?.({} as Electron.IpcRendererEvent, loginPayload)
    listeners.get(DOUYIN_IPC_CHANNELS.following.status)?.({} as Electron.IpcRendererEvent, { state: 'ready' })

    expect(status).toHaveBeenCalledWith(taskPayload)
    expect(account).toHaveBeenCalledWith(accountPayload)
    expect(login).toHaveBeenCalledWith(loginPayload)
    expect(followingStatus).toHaveBeenCalledWith({ state: 'ready' })

    stopStatus()
    stopAccount()
    stopLogin()
    stopFollowingStatus()
    expect(removeListener.mock.calls.map(([channel]) => channel)).toEqual([
      DOUYIN_IPC_CHANNELS.status,
      DOUYIN_IPC_CHANNELS.account,
      DOUYIN_IPC_CHANNELS.login,
      DOUYIN_IPC_CHANNELS.following.status,
    ])
  })
})
