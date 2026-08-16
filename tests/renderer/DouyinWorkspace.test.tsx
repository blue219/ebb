// @vitest-environment jsdom

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import DouyinWorkspace from '@/platforms/douyin/DouyinWorkspace'
import type {
  AccountSnapshot,
  DouyinBridge,
  DouyinStateSnapshot,
  LoginSnapshot,
  TaskSnapshot,
} from '../../shared/platforms/douyin/contracts'

const readyTask = (overrides: Partial<TaskSnapshot> = {}): TaskSnapshot => ({
  state: 'ready',
  videos: [
    { id: '1', title: 'First video', status: 'pending' },
    { id: '2', title: 'Second video', status: 'pending' },
  ],
  counts: { loaded: 2, selected: 0, completed: 0, failed: 0 },
  progress: { completed: 0, total: 0 },
  hasMore: false,
  isLoadingMore: false,
  isRefreshingCompletedList: false,
  ...overrides,
})

function createBridge(initial: DouyinStateSnapshot) {
  let statusListener = (_snapshot: TaskSnapshot) => {}
  let accountListener = (_snapshot: AccountSnapshot) => {}
  let loginListener = (_snapshot: LoginSnapshot) => {}
  const bridge: DouyinBridge = {
    getState: vi.fn().mockResolvedValue(initial),
    showLogin: vi.fn().mockResolvedValue(undefined),
    refreshLogin: vi.fn().mockResolvedValue(undefined),
    hideLogin: vi.fn().mockResolvedValue(undefined),
    scan: vi.fn().mockResolvedValue(undefined),
    loadMore: vi.fn().mockResolvedValue(undefined),
    refreshCompletedList: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    startAll: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    onStatus: vi.fn((callback) => { statusListener = callback; return () => {} }),
    onAccount: vi.fn((callback) => { accountListener = callback; return () => {} }),
    onLogin: vi.fn((callback) => { loginListener = callback; return () => {} }),
  }
  return {
    bridge,
    emitAccount(snapshot: AccountSnapshot) { act(() => accountListener(snapshot)) },
    emitLogin(snapshot: LoginSnapshot) { act(() => loginListener(snapshot)) },
    emitStatus(snapshot: TaskSnapshot) { act(() => statusListener(snapshot)) },
  }
}

const signedInAccount: AccountSnapshot = { state: 'signedIn', name: 'Sky', likesCount: 2 }

describe('Douyin workspace user flows', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  test('shows a QR code and scans once after sign-in succeeds', async () => {
    const state: DouyinStateSnapshot = {
      task: readyTask({ state: 'idle', videos: [], counts: { loaded: 0, selected: 0, completed: 0, failed: 0 } }),
      account: { state: 'signedOut' },
      login: { state: 'ready', qrCode: 'data:image/png;base64,aA==' },
    }
    const harness = createBridge(state)
    window.ebb = { platform: 'win32', douyin: harness.bridge }

    render(<DouyinWorkspace />)
    expect(await screen.findByRole('dialog', { name: 'Sign in to Douyin' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Douyin sign-in QR code' })).toHaveAttribute('src', state.login.qrCode)
    expect(harness.bridge.showLogin).toHaveBeenCalledOnce()

    harness.emitAccount(signedInAccount)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sign in to Douyin' })).not.toBeInTheDocument())
    expect(harness.bridge.scan).toHaveBeenCalledOnce()
    expect(localStorage.getItem('ebb:saved-douyin-session')).toBe('true')
  })

  test('freezes the visible manual selection before confirmation', async () => {
    localStorage.setItem('ebb:saved-douyin-session', 'true')
    const harness = createBridge({ task: readyTask(), account: signedInAccount, login: { state: 'idle' } })
    window.ebb = { platform: 'win32', douyin: harness.bridge }
    const user = userEvent.setup()
    render(<DouyinWorkspace />)
    await screen.findByText('First video')

    await user.click(screen.getByRole('checkbox', { name: 'First video' }))
    expect(screen.getByRole('checkbox', { name: 'First video' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Second video' })).toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Number of likes to clear' })).toHaveValue('Custom')

    await user.click(screen.getByRole('button', { name: 'Clear 1 likes' }))
    expect(screen.getByRole('dialog', { name: 'Clear 1 likes?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear likes' }))
    expect(harness.bridge.start).toHaveBeenCalledWith(['2'])
  })

  test('clamps a numeric scope and passes the frozen limit to the task module', async () => {
    localStorage.setItem('ebb:saved-douyin-session', 'true')
    const harness = createBridge({ task: readyTask(), account: signedInAccount, login: { state: 'idle' } })
    window.ebb = { platform: 'win32', douyin: harness.bridge }
    const user = userEvent.setup()
    render(<DouyinWorkspace />)
    const scope = await screen.findByRole('textbox', { name: 'Number of likes to clear' })

    await user.click(scope)
    await user.clear(scope)
    await user.type(scope, '99{Enter}')
    expect(scope).toHaveValue('2')
    await user.click(screen.getByRole('button', { name: 'Clear 2 likes' }))
    await user.click(screen.getByRole('button', { name: 'Clear likes' }))
    expect(harness.bridge.startAll).toHaveBeenCalledWith(2)
  })

  test('maps running, paused, stopped, and completed controls to task commands', async () => {
    localStorage.setItem('ebb:saved-douyin-session', 'true')
    const running = readyTask({
      state: 'running',
      mode: 'limited',
      progress: { completed: 1, total: 3 },
    })
    const harness = createBridge({ task: running, account: signedInAccount, login: { state: 'idle' } })
    window.ebb = { platform: 'win32', douyin: harness.bridge }
    const user = userEvent.setup()
    render(<DouyinWorkspace />)

    await user.click(await screen.findByRole('button', { name: 'Pause' }))
    expect(harness.bridge.pause).toHaveBeenCalledOnce()
    harness.emitStatus({ ...running, state: 'paused' })
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(harness.bridge.resume).toHaveBeenCalledWith([])
    await user.click(screen.getByRole('button', { name: 'Stop' }))
    expect(harness.bridge.stop).toHaveBeenCalledOnce()

    harness.emitStatus({ ...running, state: 'completed', progress: { completed: 3, total: 3 } })
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByRole('textbox', { name: 'Number of likes to clear' })).toHaveValue('All')
  })

  test('shows completed-list refresh progress and retries a failed refresh without resetting the task', async () => {
    localStorage.setItem('ebb:saved-douyin-session', 'true')
    const completed = readyTask({
      state: 'completed',
      mode: 'limited',
      videos: [],
      counts: { loaded: 0, selected: 0, completed: 3, failed: 0 },
      progress: { completed: 3, total: 3 },
      isRefreshingCompletedList: true,
    })
    const harness = createBridge({ task: completed, account: signedInAccount, login: { state: 'idle' } })
    window.ebb = { platform: 'win32', douyin: harness.bridge }
    const user = userEvent.setup()
    render(<DouyinWorkspace />)

    expect((await screen.findAllByText('Refreshing the remaining liked videos…')).length).toBeGreaterThan(0)
    harness.emitStatus({ ...completed, isRefreshingCompletedList: false, completionRefreshError: 'refresh unavailable' })
    expect(await screen.findByText('Could not refresh the remaining liked videos.')).toBeInTheDocument()

    const scansBeforeRetry = vi.mocked(harness.bridge.scan).mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Retry refresh' }))
    expect(harness.bridge.refreshCompletedList).toHaveBeenCalledOnce()
    expect(harness.bridge.scan).toHaveBeenCalledTimes(scansBeforeRetry)
  })

  test('surfaces command failures and switches all visible copy to Chinese', async () => {
    localStorage.setItem('ebb:saved-douyin-session', 'true')
    const running = readyTask({ state: 'running', mode: 'all', progress: { completed: 0, total: 2 } })
    const harness = createBridge({ task: running, account: signedInAccount, login: { state: 'idle' } })
    vi.mocked(harness.bridge.pause).mockRejectedValueOnce(new Error('Request rejected'))
    window.ebb = { platform: 'win32', douyin: harness.bridge }
    const user = userEvent.setup()
    render(<DouyinWorkspace />)

    await user.click(await screen.findByRole('button', { name: 'Pause' }))
    expect(await screen.findByText('Request rejected')).toBeInTheDocument()
    expect(screen.getByText('Task paused')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '中文' }))
    expect(screen.getByText('任务已暂停')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '继续' })).toBeInTheDocument()
  })

  test('requests only one next page while a load is pending', async () => {
    localStorage.setItem('ebb:saved-douyin-session', 'true')
    let finishLoad = () => {}
    const pendingLoad = new Promise<void>((resolve) => { finishLoad = resolve })
    const harness = createBridge({ task: readyTask({ hasMore: true }), account: signedInAccount, login: { state: 'idle' } })
    vi.mocked(harness.bridge.loadMore).mockReturnValue(pendingLoad)
    window.ebb = { platform: 'win32', douyin: harness.bridge }
    render(<DouyinWorkspace />)

    await screen.findByText('First video')
    await waitFor(() => expect(harness.bridge.loadMore).toHaveBeenCalledOnce())
    const table = screen.getByRole('table').parentElement
    expect(table).not.toBeNull()
    act(() => {
      table?.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 100 }))
      table?.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    expect(harness.bridge.loadMore).toHaveBeenCalledOnce()
    finishLoad()
  })
})
