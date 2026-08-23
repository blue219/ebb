import { useEffect, useState } from 'react'

import type {
  AccountSnapshot,
  FollowingTaskSnapshot,
  LoginSnapshot,
  TaskSnapshot,
} from '../../../shared/platforms/douyin/contracts'

const initialTaskSnapshot: TaskSnapshot = {
  state: 'idle',
  videos: [],
  counts: { loaded: 0, selected: 0, completed: 0, failed: 0 },
  progress: { completed: 0, total: 0 },
  hasMore: false,
  isLoadingMore: false,
  isRefreshingCompletedList: false,
}

const initialFollowingTaskSnapshot: FollowingTaskSnapshot = {
  state: 'idle',
  accounts: [],
  counts: { loaded: 0, selected: 0, completed: 0, failed: 0 },
  progress: { completed: 0, total: 0 },
  hasMore: false,
  isLoadingMore: false,
  isRefreshingCompletedList: false,
}

export function useDouyinBridgeState(loginOpen: boolean) {
  const [task, setTask] = useState(initialTaskSnapshot)
  const [followingTask, setFollowingTask] = useState(initialFollowingTaskSnapshot)
  const [account, setAccount] = useState<AccountSnapshot>({ state: 'checking' })
  const [login, setLogin] = useState<LoginSnapshot>({ state: 'idle' })

  useEffect(() => {
    const stopTask = window.ebb.douyin.onStatus(setTask)
    const stopAccount = window.ebb.douyin.onAccount(setAccount)
    const stopLogin = window.ebb.douyin.onLogin(setLogin)
    const stopFollowingTask = window.ebb.douyin.following.onStatus(setFollowingTask)

    void window.ebb.douyin.getState().then((state) => {
      setTask(state.task)
      setFollowingTask(state.followingTask)
      setAccount(state.account)
      setLogin(state.login)
    })

    return () => {
      stopTask()
      stopAccount()
      stopLogin()
      stopFollowingTask()
    }
  }, [])

  useEffect(() => {
    if (!loginOpen) return

    void window.ebb.douyin.showLogin().catch((error) => {
      setLogin({
        state: 'error',
        message: error instanceof Error ? error.message : 'Unable to load the Douyin QR code.',
      })
    })

    return () => {
      void window.ebb.douyin.hideLogin()
    }
  }, [loginOpen])

  return { account, followingTask, login, setTask, task }
}
