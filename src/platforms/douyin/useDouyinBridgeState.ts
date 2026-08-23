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
  const [collectionTask, setCollectionTask] = useState(initialTaskSnapshot)
  const [account, setAccount] = useState<AccountSnapshot>({ state: 'checking' })
  const [login, setLogin] = useState<LoginSnapshot>({ state: 'idle' })

  useEffect(() => {
    let active = true
    const received = { account: false, collectionTask: false, followingTask: false, login: false, task: false }
    const stopTask = window.ebb.douyin.onStatus((snapshot) => {
      if (!active) return
      received.task = true
      setTask(snapshot)
    })
    const stopAccount = window.ebb.douyin.onAccount((snapshot) => {
      if (!active) return
      received.account = true
      setAccount(snapshot)
    })
    const stopLogin = window.ebb.douyin.onLogin((snapshot) => {
      if (!active) return
      received.login = true
      setLogin(snapshot)
    })
    const stopFollowingTask = window.ebb.douyin.following.onStatus((snapshot) => {
      if (!active) return
      received.followingTask = true
      setFollowingTask(snapshot)
    })
    const stopCollectionTask = window.ebb.douyin.collection.onStatus((snapshot) => {
      if (!active) return
      received.collectionTask = true
      setCollectionTask(snapshot)
    })

    void window.ebb.douyin.getState().then((state) => {
      if (!active) return
      // Events published after getState was invoked are newer than its returned snapshot.
      if (!received.task) setTask(state.task)
      if (!received.followingTask) setFollowingTask(state.followingTask)
      if (!received.collectionTask) setCollectionTask(state.collectionTask)
      if (!received.account) setAccount(state.account)
      if (!received.login) setLogin(state.login)
    })

    return () => {
      active = false
      stopTask()
      stopAccount()
      stopLogin()
      stopFollowingTask()
      stopCollectionTask()
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

  return { account, collectionTask, followingTask, login, setCollectionTask, setTask, task }
}
