import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent, type WheelEvent } from 'react'

import { Button } from '@/components/ui/button'
import {
  DEFAULT_BATCH_SCOPE,
  clampBatchLimit,
  getBatchTarget,
  getScopeSelectedIds,
  transitionToManualSelection,
  type BatchScope,
} from '@/shared/batch-scope'
import type {
  DouyinVideo,
} from '../../../shared/platforms/douyin/contracts'
import { copy, type Locale } from './i18n'
import { Icon } from './icons'
import { FollowingAccountsPanel } from './FollowingAccountsPanel'
import { CollectedVideosPanel } from './CollectedVideosPanel'
import { useDouyinBridgeState } from './useDouyinBridgeState'
import { VideoRow } from './VideoRow'

const SAVED_DOUYIN_SESSION_KEY = 'ebb:saved-douyin-session'

type PendingClear =
  | { mode: 'all'; count: number }
  | { mode: 'limited'; count: number }
  | { mode: 'selected'; count: number; ids: string[] }

function DouyinWorkspace() {
  const [locale, setLocale] = useState<Locale>('en')
  const [activeWorkspace, setActiveWorkspace] = useState<'likes' | 'following' | 'collections'>('likes')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [clearScope, setClearScope] = useState<BatchScope>(DEFAULT_BATCH_SCOPE)
  const [scopeInput, setScopeInput] = useState('All')
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false)
  const [pendingClear, setPendingClear] = useState<PendingClear>()
  const [completedControlDismissed, setCompletedControlDismissed] = useState(false)
  // This boolean contains no credentials; it only prevents a sign-in flash during session restoration.
  const [loginOpen, setLoginOpen] = useState(() => localStorage.getItem(SAVED_DOUYIN_SESSION_KEY) !== 'true')
  const { account, collectionTask: collectionSnapshot, followingTask: followingSnapshot, login, setTask: setSnapshot, task: snapshot } = useDouyinBridgeState(loginOpen)
  const [busy, setBusy] = useState(false)
  const [dismissedVideoIds, setDismissedVideoIds] = useState<Set<string>>(new Set())
  const loadMorePendingRef = useRef(false)
  const loadMoreArmedRef = useRef(true)
  const autoScanStartedRef = useRef(false)
  const followingScanStartedRef = useRef(false)
  const collectionScanStartedRef = useRef(false)
  const videoScrollRef = useRef<HTMLDivElement>(null)
  const scopeControlRef = useRef<HTMLDivElement>(null)
  const completedDismissTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const t = copy[locale]

  // Derive the three list views together because this runs for every status snapshot during removal.
  const { visibleVideos, manualIdsForRemoval, loadedPendingCount } = useMemo(() => {
    const visibleVideos: DouyinVideo[] = []
    const manualIdsForRemoval: string[] = []
    let loadedPendingCount = 0
    for (const video of snapshot.videos) {
      if (!dismissedVideoIds.has(video.id)) visibleVideos.push(video)
      if (video.status === 'completed') continue
      loadedPendingCount += 1
      if (selectedIds.has(video.id)) manualIdsForRemoval.push(video.id)
    }
    return { visibleVideos, manualIdsForRemoval, loadedPendingCount }
  }, [dismissedVideoIds, selectedIds, snapshot.videos])
  const selectionContextRef = useRef({ clearScope, visibleVideos, taskState: snapshot.state, customLabel: t.custom })
  selectionContextRef.current = { clearScope, visibleVideos, taskState: snapshot.state, customLabel: t.custom }
  const totalLikes = Math.max(0, account.likedVideosCount ?? loadedPendingCount)
  const effectiveSelectedIds = useMemo(
    () => getScopeSelectedIds(clearScope, visibleVideos, selectedIds),
    [clearScope, selectedIds, visibleVideos],
  )
  const clearTarget = getBatchTarget(clearScope, totalLikes, manualIdsForRemoval.length)
  const isTaskActive = snapshot.state === 'running' || snapshot.state === 'scanning' || snapshot.isLoadingMore || snapshot.isRefreshingCompletedList
  const isTaskLocked = isTaskActive || snapshot.state === 'paused'
  const isWorkspaceSwitchLocked = ['running', 'paused'].includes(snapshot.state)
    || ['running', 'paused'].includes(followingSnapshot.state)
    || ['running', 'paused'].includes(collectionSnapshot.state)
  const isRemovalControlVisible = snapshot.progress.total > 0
    && ['running', 'paused', 'completed'].includes(snapshot.state)
    && (snapshot.state !== 'completed' || !completedControlDismissed)
  const activeCount = isRemovalControlVisible ? snapshot.progress.total : clearTarget
  const completedInCurrentRun = Math.min(snapshot.progress.total, snapshot.progress.completed)
  const removalPercent = snapshot.progress.total ? Math.round((completedInCurrentRun / snapshot.progress.total) * 100) : 0
  const isSignedIn = account.state === 'signedIn'
  const likesDisplay = account.likedVideosCount?.toLocaleString()
    ?? (snapshot.state === 'scanning' ? '…' : `${snapshot.counts.loaded}${snapshot.hasMore ? '+' : ''}`)
  const activeTaskSnapshot = activeWorkspace === 'likes' ? snapshot : activeWorkspace === 'following' ? followingSnapshot : collectionSnapshot
  const isWorkspaceRefreshing = activeTaskSnapshot.state === 'scanning'
  const isWorkspaceRefreshDisabled = !isSignedIn || busy || ['running', 'paused', 'scanning'].includes(activeTaskSnapshot.state) || activeTaskSnapshot.isLoadingMore || activeTaskSnapshot.isRefreshingCompletedList
  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
    } catch (error) {
      setSnapshot((current) => ({
        ...current,
        state: 'paused',
        message: error instanceof Error ? error.message : 'Unable to complete this action.',
      }))
    } finally {
      setBusy(false)
    }
  }, [setSnapshot])

  const refreshVideos = () => {
    for (const timeout of completedDismissTimersRef.current.values()) clearTimeout(timeout)
    completedDismissTimersRef.current.clear()
    setSelectedIds(new Set())
    setClearScope(DEFAULT_BATCH_SCOPE)
    setScopeInput(t.all)
    setScopeMenuOpen(false)
    setDismissedVideoIds(new Set())
    void run(() => window.ebb.douyin.scan())
  }

  const signOut = () => {
    localStorage.removeItem(SAVED_DOUYIN_SESSION_KEY)
    void run(() => window.ebb.douyin.signOut())
  }

  const startRemoval = () => {
    const request = pendingClear
    setPendingClear(undefined)
    if (request?.mode === 'all') void run(() => window.ebb.douyin.startAll())
    else if (request?.mode === 'limited') void run(() => window.ebb.douyin.startAll(request.count))
    else if (request?.mode === 'selected') void run(() => window.ebb.douyin.start(request.ids))
  }

  const resetClearScope = () => {
    setClearScope(DEFAULT_BATCH_SCOPE)
    setScopeInput(t.all)
    setSelectedIds(new Set())
    setScopeMenuOpen(false)
    if (snapshot.state === 'completed') setCompletedControlDismissed(true)
  }

  const handleRemovalControl = () => {
    if (snapshot.state === 'completed') {
      resetClearScope()
      return
    }
    if (snapshot.state === 'running') {
      void run(() => window.ebb.douyin.pause())
    } else if (snapshot.state === 'paused' && (snapshot.mode !== 'selected' || manualIdsForRemoval.length)) {
      void run(() => window.ebb.douyin.resume(manualIdsForRemoval))
    }
  }

  const dismissCompletedVideo = useCallback((id: string) => {
    const timeout = completedDismissTimersRef.current.get(id)
    if (timeout) clearTimeout(timeout)
    completedDismissTimersRef.current.delete(id)
    setDismissedVideoIds((current) => new Set(current).add(id))
    setSelectedIds((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }, [])

  useEffect(() => {
    if (account.state === 'signedOut') {
      autoScanStartedRef.current = false
      followingScanStartedRef.current = false
      collectionScanStartedRef.current = false
      setLoginOpen(true)
      return
    }
    if (account.state !== 'signedIn') return

    localStorage.setItem(SAVED_DOUYIN_SESSION_KEY, 'true')
    setLoginOpen(false)
    if (autoScanStartedRef.current) return
    autoScanStartedRef.current = true
    void run(() => window.ebb.douyin.scan())
  }, [account.state, run])

  useEffect(() => {
    if (activeWorkspace !== 'following' || account.state !== 'signedIn') return
    if (followingSnapshot.state !== 'idle' || followingScanStartedRef.current) return
    followingScanStartedRef.current = true
    void window.ebb.douyin.following.scan().catch(() => {
      followingScanStartedRef.current = false
    })
  }, [account.state, activeWorkspace, followingSnapshot.state])

  useEffect(() => {
    if (activeWorkspace !== 'collections' || account.state !== 'signedIn') return
    if (collectionSnapshot.state !== 'idle' || collectionScanStartedRef.current) return
    collectionScanStartedRef.current = true
    void window.ebb.douyin.collection.scan().catch(() => {
      collectionScanStartedRef.current = false
    })
  }, [account.state, activeWorkspace, collectionSnapshot.state])

  useEffect(() => {
    if (snapshot.state !== 'scanning') return
    for (const timeout of completedDismissTimersRef.current.values()) clearTimeout(timeout)
    completedDismissTimersRef.current.clear()
    loadMoreArmedRef.current = true
    loadMorePendingRef.current = false
    setDismissedVideoIds(new Set())
  }, [snapshot.state])

  useEffect(() => {
    if (snapshot.state !== 'completed') setCompletedControlDismissed(false)
  }, [snapshot.state])

  useEffect(() => {
    if (clearScope.kind === 'all') setScopeInput(t.all)
    else if (clearScope.kind === 'manual') setScopeInput(t.custom)
  }, [clearScope.kind, t.all, t.custom])

  useEffect(() => {
    const closeScopeMenu = (event: PointerEvent) => {
      if (!scopeControlRef.current?.contains(event.target as Node)) setScopeMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeScopeMenu)
    return () => document.removeEventListener('pointerdown', closeScopeMenu)
  }, [])

  useEffect(() => {
    for (const video of snapshot.videos) {
      if (video.status !== 'completed' || dismissedVideoIds.has(video.id) || completedDismissTimersRef.current.has(video.id)) continue
      const timeout = setTimeout(() => dismissCompletedVideo(video.id), 360)
      completedDismissTimersRef.current.set(video.id, timeout)
    }
  }, [dismissCompletedVideo, dismissedVideoIds, snapshot.videos])

  useEffect(() => () => {
    for (const timeout of completedDismissTimersRef.current.values()) clearTimeout(timeout)
    completedDismissTimersRef.current.clear()
  }, [])

  const requestNextPageNearBottom = useCallback((container: HTMLDivElement, allowAtTop = false) => {
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    const prefetchDistance = Math.max(320, container.clientHeight / 2)
    if (distanceFromBottom > prefetchDistance) {
      loadMoreArmedRef.current = true
      return
    }
    if ((!allowAtTop && container.scrollTop <= 0) || !loadMoreArmedRef.current || loadMorePendingRef.current) return
    if (!snapshot.hasMore || snapshot.isLoadingMore || snapshot.isRefreshingCompletedList || !['ready', 'completed', 'stopped'].includes(snapshot.state)) return

    // Require another user scroll toward the new bottom before requesting the following page.
    loadMoreArmedRef.current = false
    loadMorePendingRef.current = true
    void window.ebb.douyin.loadMore().finally(() => {
      loadMorePendingRef.current = false
    })
  }, [snapshot.hasMore, snapshot.isLoadingMore, snapshot.isRefreshingCompletedList, snapshot.state])

  const handleVideoScroll = (event: UIEvent<HTMLDivElement>) => {
    requestNextPageNearBottom(event.currentTarget)
  }

  const handleVideoWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY > 0) requestNextPageNearBottom(event.currentTarget, true)
  }

  useEffect(() => {
    const container = videoScrollRef.current
    if (container) requestNextPageNearBottom(container, true)
  }, [requestNextPageNearBottom, visibleVideos.length])

  const selectClearScope = (scope: BatchScope) => {
    setClearScope(scope)
    setScopeInput(scope.kind === 'all' ? t.all : scope.kind === 'manual' ? t.custom : String(scope.limit))
    if (scope.kind !== 'manual') setSelectedIds(new Set())
    setScopeMenuOpen(false)
    if (snapshot.state === 'completed') setCompletedControlDismissed(true)
  }

  const commitScopeInput = () => {
    const parsed = Number(scopeInput)
    if (!scopeInput.trim() || !Number.isFinite(parsed)) {
      setScopeInput(clearScope.kind === 'all' ? t.all : clearScope.kind === 'manual' ? t.custom : String(clearScope.limit))
      return
    }
    const limit = clampBatchLimit(parsed, totalLikes)
    if (limit > 0) selectClearScope({ kind: 'limit', limit })
    else setScopeInput(t.all)
  }

  const toggleVideo = useCallback((id: string) => {
    const { clearScope, visibleVideos, taskState, customLabel } = selectionContextRef.current
    // The first row interaction promotes generated All/limit checks into an explicit manual selection.
    setSelectedIds((current) => transitionToManualSelection(clearScope, visibleVideos, current, id))
    setClearScope({ kind: 'manual' })
    setScopeInput(customLabel)
    setScopeMenuOpen(false)
    if (taskState === 'completed') setCompletedControlDismissed(true)
  }, [])

  const prepareClear = () => {
    if (clearTarget <= 0) return
    if (clearScope.kind === 'all') setPendingClear({ mode: 'all', count: clearTarget })
    else if (clearScope.kind === 'limit') setPendingClear({ mode: 'limited', count: clearTarget })
    else setPendingClear({ mode: 'selected', count: manualIdsForRemoval.length, ids: [...manualIdsForRemoval] })
  }

  const formatCount = (count: number) => count.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')
  const clearButtonLabel = t.clearLikes.replace('{count}', formatCount(clearTarget))
  const pendingClearTitle = pendingClear ? t.confirmClearTitle.replace('{count}', formatCount(pendingClear.count)) : ''
  const pendingClearBody = pendingClear
    ? (pendingClear.mode === 'all'
        ? t.confirmAllBody
        : pendingClear.mode === 'limited'
          ? t.confirmLimitBody.replace('{count}', formatCount(pendingClear.count))
          : t.confirmManualBody.replace('{count}', formatCount(pendingClear.count)))
    : ''

  return (
    <main className="h-svh overflow-hidden bg-[#f4f6fa] p-0 text-zinc-950 sm:p-2">
      <div className="app-shell mx-auto flex h-full w-full max-w-[1560px] flex-col overflow-hidden border border-white/90 bg-white/70 shadow-[0_18px_65px_rgba(0,0,0,0.08)] backdrop-blur-2xl sm:rounded-[28px] md:flex-row">
        <aside className="workspace-sidebar" aria-label={t.platforms}>
          <div>
            <h1 className="text-[2rem] leading-none font-semibold tracking-[-0.065em]">Ebb</h1>
            <div className="mt-7 flex min-w-0 items-center gap-3 rounded-2xl border border-white/85 bg-white/68 p-3 shadow-[0_5px_20px_rgba(15,23,42,0.04)]">
              {account.avatar
                ? <img className="size-10 shrink-0 rounded-full object-cover" src={account.avatar} alt="" />
                : <div className="grid size-10 shrink-0 place-items-center rounded-full bg-zinc-100"><Icon name={account.state === 'checking' ? 'loader' : 'heart'} className={`size-4 text-zinc-500 ${account.state === 'checking' ? 'animate-spin' : ''}`} /></div>}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{account.state === 'checking' ? t.checkingLogin : account.name ?? 'Douyin'}</p>
                {isSignedIn && <p className="mt-0.5 text-xs text-zinc-500">{likesDisplay} {t.likes}</p>}
              </div>
            </div>
          </div>

          <div className="mt-6 flex min-h-0 flex-1 flex-col gap-6">
            <section>
              <p className="mb-2 px-1 text-[11px] font-medium tracking-[0.08em] text-zinc-400 uppercase">{t.platforms}</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5 rounded-xl border border-blue-200/80 bg-blue-50/75 px-3 py-2.5 text-sm text-blue-700">
                  <span className="grid size-7 place-items-center rounded-lg bg-zinc-950 text-[10px] font-bold text-white">D</span>
                  <span className="min-w-0 flex-1 font-medium">Douyin</span>
                  {isSignedIn && <span className="flex items-center gap-1 text-[10px] font-medium"><span className="size-1.5 rounded-full bg-blue-500" />{t.connected}</span>}
                </div>
                {['TikTok', 'YouTube'].map((platform) => <div key={platform} aria-disabled="true" className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-zinc-400">
                  <span className="grid size-7 place-items-center rounded-lg bg-zinc-100 text-[10px] font-bold text-zinc-400">{platform.slice(0, 1)}</span>
                  <span className="min-w-0 flex-1 font-medium">{platform}</span>
                  <span className="text-[10px]">{t.comingSoon}</span>
                </div>)}
              </div>
            </section>
          </div>

          <div className="mt-5 flex gap-2 border-t border-zinc-200/70 pt-4">
            <Button variant="outline" className="h-9 flex-1 rounded-xl border-zinc-200 bg-white/65 px-3 text-xs text-zinc-700 shadow-none" onClick={() => setLocale((current) => current === 'en' ? 'zh' : 'en')}><Icon name="globe" className="size-4" />{locale === 'en' ? '中文' : 'English'}</Button>
            {!isSignedIn
              ? <Button aria-label={t.login} className="size-9 rounded-xl bg-zinc-950 p-0 text-white hover:bg-zinc-800" disabled={busy || account.state === 'checking'} onClick={() => setLoginOpen(true)}><Icon name="globe" className="size-4" /></Button>
              : <Button variant="outline" aria-label={t.signOut} title={t.signOut} className="size-9 rounded-xl border-zinc-200 bg-white/65 p-0 text-zinc-700 shadow-none" disabled={busy || isTaskActive} onClick={signOut}><Icon name="logout" className="size-4" /></Button>}
          </div>
        </aside>

        <section className="workspace-content">
          <header className="relative flex h-[72px] shrink-0 items-center justify-end border-b border-zinc-200/70 px-4 sm:px-6">
            <nav className="absolute left-1/2 flex -translate-x-1/2 rounded-2xl border border-zinc-200/80 bg-white/60 p-1.5 text-sm shadow-sm" aria-label="Douyin workspace" role="group">
              <button type="button" aria-pressed={activeWorkspace === 'likes'} className={`rounded-xl px-5 py-2.5 font-medium transition-colors ${activeWorkspace === 'likes' ? 'bg-zinc-950 text-white shadow-sm' : 'text-zinc-600 hover:bg-white/80'}`} disabled={isWorkspaceSwitchLocked} onClick={() => setActiveWorkspace('likes')}>{t.likedVideosTab}</button>
              <button type="button" aria-pressed={activeWorkspace === 'following'} className={`rounded-xl px-5 py-2.5 font-medium transition-colors ${activeWorkspace === 'following' ? 'bg-zinc-950 text-white shadow-sm' : 'text-zinc-600 hover:bg-white/80'}`} disabled={isWorkspaceSwitchLocked} onClick={() => setActiveWorkspace('following')}>{t.followingAccountsTab}</button>
              <button type="button" aria-pressed={activeWorkspace === 'collections'} className={`rounded-xl px-5 py-2.5 font-medium transition-colors ${activeWorkspace === 'collections' ? 'bg-zinc-950 text-white shadow-sm' : 'text-zinc-600 hover:bg-white/80'}`} disabled={isWorkspaceSwitchLocked} onClick={() => setActiveWorkspace('collections')}>{t.collectedVideosTab}</button>
            </nav>
            <Button variant="outline" aria-label={activeWorkspace === 'likes' ? t.refreshList : activeWorkspace === 'following' ? t.refreshFollowingList : t.refreshCollectionList} title={activeWorkspace === 'likes' ? t.refreshList : activeWorkspace === 'following' ? t.refreshFollowingList : t.refreshCollectionList} className="size-9 rounded-xl border-zinc-200 bg-white/65 p-0 text-zinc-700 shadow-none" disabled={isWorkspaceRefreshDisabled} onClick={activeWorkspace === 'likes' ? refreshVideos : activeWorkspace === 'following' ? () => void window.ebb.douyin.following.scan() : () => void window.ebb.douyin.collection.scan()}><Icon name="refresh" className={`size-5 ${isWorkspaceRefreshing ? 'animate-spin' : ''}`} /></Button>
          </header>

          {activeWorkspace === 'likes' ? <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <span className="sr-only" role="status">{t.taskStates[snapshot.state]}</span>
            <span className="sr-only" role="status">{snapshot.message ?? t.privacy}</span>

            {visibleVideos.length ? <div ref={videoScrollRef} data-testid="video-collection" className="table-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-28" onScroll={handleVideoScroll} onWheel={handleVideoWheel}>
              <div className="video-cover-grid">{visibleVideos.map((video) => <VideoRow key={video.id} id={video.id} title={video.title} thumbnail={video.thumbnail} status={video.status} selected={effectiveSelectedIds.has(video.id)} taskLocked={isTaskLocked} onToggle={toggleVideo} onDismiss={dismissCompletedVideo} />)}</div>
              <div className="flex h-10 items-center px-4 text-[11px] text-zinc-500">{snapshot.isLoadingMore || snapshot.isRefreshingCompletedList ? <span className="flex items-center gap-2"><Icon name="loader" className="size-3.5 animate-spin" /> {snapshot.isRefreshingCompletedList ? t.refreshingCompletedList : t.loadingMore}</span> : !snapshot.hasMore && <span className="flex items-center gap-2"><Icon name="check" className="size-3.5 text-emerald-600" /> {t.allLoaded}</span>}</div>
            </div> : snapshot.isRefreshingCompletedList ? <div className="grid flex-1 place-items-center px-6 py-14 text-center"><div><div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-zinc-100"><Icon name="loader" className="size-5 animate-spin text-zinc-500" /></div><h3 className="mt-4 text-base font-semibold">{t.refreshingCompletedList}</h3></div></div> : snapshot.completionRefreshError ? <div className="grid flex-1 place-items-center px-6 py-14 text-center"><div><div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-red-50"><Icon name="warning" className="size-5 text-red-600" /></div><h3 className="mt-4 text-base font-semibold">{t.refreshCompletedListFailed}</h3><p className="mt-1 max-w-xs text-sm leading-5 text-zinc-500">{snapshot.completionRefreshError}</p><Button variant="outline" className="mt-4 rounded-xl border-zinc-200 bg-white/70 text-xs" disabled={busy} onClick={() => run(() => window.ebb.douyin.refreshCompletedList())}><Icon name="refresh" className="size-4" /> {t.retryRefresh}</Button></div></div> : <div className="grid flex-1 place-items-center px-6 py-14 text-center"><div><div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-zinc-100"><Icon name="heart" className="size-5 text-zinc-500" /></div><h3 className="mt-4 text-base font-semibold">{t.emptyTitle}</h3><p className="mt-1 max-w-xs text-sm leading-5 text-zinc-500">{t.emptyBody}</p></div></div>}

            <div className="floating-action-bar">
              <span className="px-2 text-sm font-medium text-zinc-600">{t.selected} {formatCount(activeCount)}</span>
              <div ref={scopeControlRef} className="batch-scope-control"><div className="batch-scope-field" data-open={scopeMenuOpen}><input aria-label={t.clearAmount} aria-controls="batch-scope-menu" aria-expanded={scopeMenuOpen} aria-haspopup="listbox" disabled={isTaskLocked || busy || !isSignedIn} inputMode="numeric" value={scopeInput} onBlur={commitScopeInput} onChange={(event) => setScopeInput(event.target.value.replace(/\D/g, ''))} onClick={(event) => { setScopeMenuOpen(true); event.currentTarget.select() }} onFocus={(event) => { setScopeMenuOpen(true); event.currentTarget.select() }} onKeyDown={(event) => { if (event.key === 'Enter') { commitScopeInput(); event.currentTarget.blur() } else if (event.key === 'Escape') { setScopeMenuOpen(false); event.currentTarget.blur() } }} /><button type="button" aria-label={t.quickSelect} disabled={isTaskLocked || busy || !isSignedIn} onMouseDown={(event) => event.preventDefault()} onClick={() => setScopeMenuOpen((current) => !current)}><Icon name="chevron" className={`size-4 transition-transform ${scopeMenuOpen ? 'rotate-180' : ''}`} /></button></div>{scopeMenuOpen && <div id="batch-scope-menu" className="batch-scope-menu" role="listbox" aria-label={t.quickSelect}><p>{t.quickSelect}</p><div className="grid grid-cols-4 gap-1.5"><button type="button" role="option" aria-selected={clearScope.kind === 'all'} data-selected={clearScope.kind === 'all'} onMouseDown={(event) => event.preventDefault()} onClick={() => selectClearScope(DEFAULT_BATCH_SCOPE)}>{t.all}</button>{[10, 50, 100].map((amount) => <button type="button" role="option" aria-selected={clearScope.kind === 'limit' && clearScope.limit === amount} data-selected={clearScope.kind === 'limit' && clearScope.limit === amount} disabled={amount > totalLikes} key={amount} onMouseDown={(event) => event.preventDefault()} onClick={() => selectClearScope({ kind: 'limit', limit: amount })}>{amount}</button>)}</div><span>{t.amountHint.replace('{count}', formatCount(totalLikes))}</span></div>}</div>
              {clearScope.kind !== 'all' && <Button variant="outline" className="h-11 rounded-xl border-zinc-200 bg-white/65 px-3.5 text-sm text-zinc-600 shadow-none" disabled={isTaskLocked} onClick={resetClearScope}><Icon name="x" className="size-4" /> {t.reset}</Button>}
              {isRemovalControlVisible ? <button type="button" className="removal-progress group" data-complete={snapshot.state === 'completed'} aria-label={snapshot.state === 'completed' ? t.reset : snapshot.state === 'paused' ? t.continue : t.pause} title={snapshot.state === 'completed' ? t.reset : snapshot.state === 'paused' ? t.continue : t.pause} disabled={busy || (snapshot.state === 'paused' && snapshot.mode === 'selected' && !manualIdsForRemoval.length)} onClick={handleRemovalControl}><span className="removal-progress-fill" style={{ width: `${removalPercent}%` }} />{snapshot.state === 'completed' ? <span className="removal-progress-action"><Icon name="check" className="size-4" /> 100%</span> : snapshot.state === 'paused' ? <span className="removal-progress-action"><Icon name="play" className="size-4" /> {t.continue}</span> : <><span className="removal-progress-label">{t.removing} {completedInCurrentRun}/{snapshot.progress.total}</span><span className="removal-progress-action removal-progress-hover"><Icon name="pause" className="size-4" /></span></>}</button> : <Button variant="destructive" className="h-11 rounded-xl bg-red-600 px-4 text-sm text-white shadow-[0_5px_14px_rgba(220,38,38,0.18)] hover:bg-red-700" disabled={!isSignedIn || isTaskLocked || busy || clearTarget <= 0} onClick={prepareClear}><Icon name="heart" className="size-4" /> {clearButtonLabel}</Button>}
              <Button variant="outline" className="h-11 rounded-xl border-zinc-200 bg-white/65 px-3.5 text-sm text-zinc-700 shadow-none" disabled={!['running', 'paused'].includes(snapshot.state) || busy} onClick={() => run(() => window.ebb.douyin.stop())}><Icon name="stop" className="size-4" /> {t.stop}</Button>
            </div>
          </section> : activeWorkspace === 'following' ? <FollowingAccountsPanel account={account} locale={locale} snapshot={followingSnapshot} /> : <CollectedVideosPanel account={account} locale={locale} snapshot={collectionSnapshot} />}
        </section>
      </div>

      {loginOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/25 p-3 backdrop-blur-md sm:p-5" role="presentation">
        <section aria-modal="true" role="dialog" aria-labelledby="login-title" className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/85 bg-white/95 p-5 text-center shadow-[0_28px_90px_rgba(0,0,0,0.24)] sm:p-7">
          <Button variant="outline" aria-label={t.close} className="absolute top-4 right-4 size-9 rounded-full border-zinc-200 bg-white/90 p-0 text-zinc-600 shadow-sm" onClick={() => setLoginOpen(false)}><Icon name="x" className="size-4" /></Button>
          <div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-zinc-950 text-white shadow-sm"><Icon name="globe" className="size-5" /></div>
          <h2 id="login-title" className="mt-4 text-2xl font-semibold tracking-[-0.045em]">{t.loginTitle}</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-5 text-zinc-500">{t.loginBody}</p>

          <div className="mx-auto mt-6 grid aspect-square w-full max-w-[280px] place-items-center overflow-hidden rounded-[24px] border border-zinc-200/80 bg-white p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.9),0_10px_30px_rgba(0,0,0,0.05)]">
            {login.state === 'ready' && login.qrCode
              ? <img className="size-full object-contain [image-rendering:pixelated]" src={login.qrCode} alt={t.qrAlt} />
              : login.state === 'verification'
                ? <div className="px-4"><Icon name="warning" className="mx-auto size-8 text-amber-500" /><p className="mt-3 text-sm font-medium text-zinc-800">{t.loginVerification}</p></div>
                : login.state === 'error'
                  ? <div className="px-4"><Icon name="warning" className="mx-auto size-8 text-red-500" /><p className="mt-3 text-sm font-medium text-zinc-800">{login.message ?? t.loginError}</p></div>
                  : <div><Icon name="loader" className="mx-auto size-7 animate-spin text-zinc-400" /><p className="mt-3 text-sm text-zinc-500">{t.loginLoading}</p></div>}
          </div>

          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-zinc-500">
            {login.state === 'ready' && <><span className="size-1.5 rounded-full bg-emerald-500" /> {t.loginReady}</>}
            {login.state !== 'ready' && <span>{t.loginHint}</span>}
          </div>
          {(login.state === 'verification' || login.state === 'error') && <Button variant="outline" className="mt-4 h-9 rounded-xl border-zinc-200 bg-white text-xs" onClick={() => void window.ebb.douyin.refreshLogin()}><Icon name="refresh" className="size-4" /> {t.refreshQr}</Button>}
        </section>
      </div>}

      {pendingClear && <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4 backdrop-blur-sm" role="presentation">
        <section aria-modal="true" role="dialog" aria-labelledby="confirm-clear-title" className="w-full max-w-md rounded-[24px] border border-white/80 bg-white/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.2)]">
          <Icon name="warning" className="size-6 text-red-600" />
          <h2 id="confirm-clear-title" className="mt-4 text-xl font-semibold tracking-[-0.035em]">{pendingClearTitle}</h2>
          <p className="mt-2 text-sm leading-5 text-zinc-600">{pendingClearBody}</p>
          <div className="mt-6 flex justify-end gap-2"><Button variant="outline" className="rounded-xl border-zinc-200" onClick={() => setPendingClear(undefined)}>{t.cancel}</Button><Button variant="destructive" className="rounded-xl bg-red-600 text-white hover:bg-red-700" onClick={startRemoval}>{t.confirmClear}</Button></div>
        </section>
      </div>}
    </main>
  )
}

export default DouyinWorkspace
