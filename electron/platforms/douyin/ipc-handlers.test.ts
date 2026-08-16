import type { IpcMain } from 'electron'
import { describe, expect, test, vi } from 'vitest'

import { DOUYIN_IPC_CHANNELS } from '../../../shared/platforms/douyin/contracts.ts'
import { registerDouyinIpcHandlers } from './ipc-handlers.ts'
import type { DouyinTaskService } from './task-service.ts'

describe('Douyin main-process IPC handlers', () => {
  test('exposes the state snapshot and delegates every command', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipc = {
      handle: vi.fn((channel: string, listener: (...args: unknown[]) => unknown) => handlers.set(channel, listener)),
    } as unknown as Pick<IpcMain, 'handle'>
    const task = {
      getTaskSnapshot: vi.fn(() => ({ state: 'ready' })),
      getAccountSnapshot: vi.fn(() => ({ state: 'signedIn' })),
      getLoginSnapshot: vi.fn(() => ({ state: 'idle' })),
      showLogin: vi.fn(),
      refreshLogin: vi.fn(),
      hideLogin: vi.fn(),
      scan: vi.fn(),
      loadMore: vi.fn(),
      refreshCompletedList: vi.fn(),
      start: vi.fn(),
      startAll: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn(),
      signOut: vi.fn(),
    } as unknown as DouyinTaskService

    registerDouyinIpcHandlers(ipc, task)

    expect(await handlers.get(DOUYIN_IPC_CHANNELS.getState)?.({})).toEqual({
      task: { state: 'ready' },
      account: { state: 'signedIn' },
      login: { state: 'idle' },
    })
    await handlers.get(DOUYIN_IPC_CHANNELS.showLogin)?.({})
    await handlers.get(DOUYIN_IPC_CHANNELS.refreshLogin)?.({})
    await handlers.get(DOUYIN_IPC_CHANNELS.hideLogin)?.({})
    await handlers.get(DOUYIN_IPC_CHANNELS.scan)?.({})
    await handlers.get(DOUYIN_IPC_CHANNELS.loadMore)?.({})
    await handlers.get(DOUYIN_IPC_CHANNELS.refreshCompletedList)?.({})
    await handlers.get(DOUYIN_IPC_CHANNELS.start)?.({}, ['1'])
    await handlers.get(DOUYIN_IPC_CHANNELS.startAll)?.({}, 10)
    await handlers.get(DOUYIN_IPC_CHANNELS.pause)?.({})
    await handlers.get(DOUYIN_IPC_CHANNELS.resume)?.({}, ['2'])
    await handlers.get(DOUYIN_IPC_CHANNELS.stop)?.({})
    await handlers.get(DOUYIN_IPC_CHANNELS.signOut)?.({})

    expect(task.showLogin).toHaveBeenCalledOnce()
    expect(task.refreshLogin).toHaveBeenCalledOnce()
    expect(task.hideLogin).toHaveBeenCalledOnce()
    expect(task.scan).toHaveBeenCalledOnce()
    expect(task.loadMore).toHaveBeenCalledOnce()
    expect(task.refreshCompletedList).toHaveBeenCalledOnce()
    expect(task.start).toHaveBeenCalledWith(['1'])
    expect(task.startAll).toHaveBeenCalledWith(10)
    expect(task.pause).toHaveBeenCalledOnce()
    expect(task.resume).toHaveBeenCalledWith(['2'])
    expect(task.stop).toHaveBeenCalledOnce()
    expect(task.signOut).toHaveBeenCalledOnce()
  })
})
