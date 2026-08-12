import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent, type WheelEvent } from 'react'

import { Button } from '@/components/ui/button'
import {
  DEFAULT_CLEAR_SCOPE,
  clampClearLimit,
  getClearTarget,
  getScopeSelectedIds,
  transitionToManualSelection,
  type ClearScope,
} from '@/shared/clear-scope'
import type {
  AccountSnapshot,
  LoginSnapshot,
  TaskSnapshot,
  VideoStatus,
} from '../../../shared/platforms/douyin/contracts'
import { copy, type Locale } from './i18n'

const initialSnapshot: TaskSnapshot = {
  state: 'idle',
  videos: [],
  counts: { loaded: 0, selected: 0, completed: 0, failed: 0 },
  progress: { completed: 0, total: 0 },
  hasMore: false,
  isLoadingMore: false,
}

const SAVED_DOUYIN_SESSION_KEY = 'ebb:saved-douyin-session'

const statusStyles: Record<VideoStatus, string> = {
  pending: 'text-zinc-500',
  processing: 'text-zinc-900',
  completed: 'text-emerald-700',
  failed: 'text-red-600',
}

type IconName = 'check' | 'chevron' | 'globe' | 'heart' | 'loader' | 'logout' | 'pause' | 'play' | 'refresh' | 'shield' | 'stop' | 'warning' | 'x'

type PendingClear =
  | { mode: 'all'; count: number }
  | { mode: 'limited'; count: number }
  | { mode: 'selected'; count: number; ids: string[] }

function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const props = { className: `inline-block shrink-0 ${className}`, fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (name === 'check') return <svg {...props}><path d="m5 12 4 4L19 6" /></svg>
  if (name === 'chevron') return <svg {...props}><path d="m8 10 4 4 4-4" /></svg>
  if (name === 'globe') return <svg {...props}><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2.2 2.2 3.2 5 3.2 8S14.2 17.8 12 20c-2.2-2.2-3.2-5-3.2-8S9.8 6.2 12 4" /></svg>
  if (name === 'heart') return <svg {...props}><path d="M20.8 8.6c0 5.2-8.8 10.2-8.8 10.2S3.2 13.8 3.2 8.6A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8.8 1.9ZM4 4l16 16" /></svg>
  if (name === 'loader') return <svg {...props}><path d="M20 12a8 8 0 1 1-2.3-5.7" /></svg>
  if (name === 'logout') return <svg {...props}><path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M14 8l4 4-4 4M18 12H9" /></svg>
  if (name === 'pause') return <svg {...props}><circle cx="12" cy="12" r="8" /><path d="M10 9v6M14 9v6" /></svg>
  if (name === 'play') return <svg {...props}><circle cx="12" cy="12" r="8" /><path d="m10 9 5 3-5 3Z" /></svg>
  if (name === 'refresh') return <svg {...props}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M18.1 9A7 7 0 0 0 6.7 6.7L4 9M5.9 15A7 7 0 0 0 17.3 17.3L20 15" /></svg>
  if (name === 'shield') return <svg {...props}><path d="M12 3 19 6v5c0 4.6-3 7.8-7 10-4-2.2-7-5.4-7-10V6l7-3Z" /><path d="m8.7 12 2.1 2.1 4.5-4.4" /></svg>
  if (name === 'stop') return <svg {...props}><circle cx="12" cy="12" r="8" /><path d="M9 9h6v6H9z" /></svg>
  if (name === 'warning') return <svg {...props}><path d="m12 4 8 15H4L12 4Z" /><path d="M12 9v4M12 16h.01" /></svg>
  return <svg {...props}><path d="m7 7 10 10M17 7 7 17" /></svg>
}

function DouyinWorkspace() {
  const [locale, setLocale] = useState<Locale>('en')
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [account, setAccount] = useState<AccountSnapshot>({ state: 'checking' })
  const [login, setLogin] = useState<LoginSnapshot>({ state: 'idle' })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [clearScope, setClearScope] = useState<ClearScope>(DEFAULT_CLEAR_SCOPE)
  const [scopeInput, setScopeInput] = useState('All')
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false)
  const [pendingClear, setPendingClear] = useState<PendingClear>()
  const [completedControlDismissed, setCompletedControlDismissed] = useState(false)
  // This boolean contains no credentials; it only prevents a sign-in flash during session restoration.
  const [loginOpen, setLoginOpen] = useState(() => localStorage.getItem(SAVED_DOUYIN_SESSION_KEY) !== 'true')
  const [busy, setBusy] = useState(false)
  const [dismissedVideoIds, setDismissedVideoIds] = useState<Set<string>>(new Set())
  const loadMorePendingRef = useRef(false)
  const loadMoreArmedRef = useRef(true)
  const autoScanStartedRef = useRef(false)
  const videoScrollRef = useRef<HTMLDivElement>(null)
  const scopeControlRef = useRef<HTMLDivElement>(null)
  const completedDismissTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const t = copy[locale]

  useEffect(() => {
    const stopStatus = window.ebb.douyin.onStatus(setSnapshot)
    const stopAccount = window.ebb.douyin.onAccount(setAccount)
    const stopLogin = window.ebb.douyin.onLogin(setLogin)
    void window.ebb.douyin.getState().then(({ task, account: savedAccount, login: savedLogin }) => {
      setSnapshot(task)
      setAccount(savedAccount)
      setLogin(savedLogin)
    })
    return () => {
      stopStatus()
      stopAccount()
      stopLogin()
    }
  }, [])

  useEffect(() => {
    if (!loginOpen) return

    void window.ebb.douyin.showLogin().catch((error) => {
      setLogin({ state: 'error', message: error instanceof Error ? error.message : 'Unable to load the Douyin QR code.' })
    })

    return () => {
      void window.ebb.douyin.hideLogin()
    }
  }, [loginOpen])

  const visibleVideos = useMemo(() => snapshot.videos.filter((video) => !dismissedVideoIds.has(video.id)), [dismissedVideoIds, snapshot.videos])

  const manualIdsForRemoval = useMemo(() => snapshot.videos
    .filter((video) => selectedIds.has(video.id) && video.status !== 'completed')
    .map((video) => video.id), [selectedIds, snapshot.videos])
  const loadedPendingCount = snapshot.videos.filter((video) => video.status !== 'completed').length
  const totalLikes = Math.max(0, account.likesCount ?? loadedPendingCount)
  const effectiveSelectedIds = useMemo(
    () => getScopeSelectedIds(clearScope, visibleVideos, selectedIds),
    [clearScope, selectedIds, visibleVideos],
  )
  const clearTarget = getClearTarget(clearScope, totalLikes, manualIdsForRemoval.length)
  const isTaskActive = snapshot.state === 'running' || snapshot.state === 'scanning' || snapshot.isLoadingMore
  const isTaskLocked = isTaskActive || snapshot.state === 'paused'
  const isRemovalControlVisible = snapshot.progress.total > 0
    && ['running', 'paused', 'completed'].includes(snapshot.state)
    && (snapshot.state !== 'completed' || !completedControlDismissed)
  const activeCount = isRemovalControlVisible ? snapshot.progress.total : clearTarget
  const completedInCurrentRun = Math.min(snapshot.progress.total, snapshot.progress.completed)
  const removalPercent = snapshot.progress.total ? Math.round((completedInCurrentRun / snapshot.progress.total) * 100) : 0
  const isSignedIn = account.state === 'signedIn'
  const likesDisplay = account.likesCount?.toLocaleString()
    ?? (snapshot.state === 'scanning' ? '…' : `${snapshot.counts.loaded}${snapshot.hasMore ? '+' : ''}`)

  const run = async (action: () => Promise<void>) => {
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
  }

  const refreshVideos = () => {
    for (const timeout of completedDismissTimersRef.current.values()) clearTimeout(timeout)
    completedDismissTimersRef.current.clear()
    setSelectedIds(new Set())
    setClearScope(DEFAULT_CLEAR_SCOPE)
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
    setClearScope(DEFAULT_CLEAR_SCOPE)
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

  const dismissCompletedVideo = (id: string) => {
    const timeout = completedDismissTimersRef.current.get(id)
    if (timeout) clearTimeout(timeout)
    completedDismissTimersRef.current.delete(id)
    setDismissedVideoIds((current) => new Set(current).add(id))
    setSelectedIds((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }

  useEffect(() => {
    if (account.state === 'signedOut') {
      autoScanStartedRef.current = false
      setLoginOpen(true)
      return
    }
    if (account.state !== 'signedIn') return

    localStorage.setItem(SAVED_DOUYIN_SESSION_KEY, 'true')
    setLoginOpen(false)
    if (autoScanStartedRef.current) return
    autoScanStartedRef.current = true
    void run(() => window.ebb.douyin.scan())
  }, [account.state])

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
  }, [dismissedVideoIds, snapshot.videos])

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
    if (!snapshot.hasMore || snapshot.isLoadingMore || !['ready', 'completed', 'stopped'].includes(snapshot.state)) return

    // Require another user scroll toward the new bottom before requesting the following page.
    loadMoreArmedRef.current = false
    loadMorePendingRef.current = true
    void window.ebb.douyin.loadMore().finally(() => {
      loadMorePendingRef.current = false
    })
  }, [snapshot.hasMore, snapshot.isLoadingMore, snapshot.state])

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

  const selectClearScope = (scope: ClearScope) => {
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
    const limit = clampClearLimit(parsed, totalLikes)
    if (limit > 0) selectClearScope({ kind: 'limit', limit })
    else setScopeInput(t.all)
  }

  const toggleVideo = (id: string) => {
    // The first row interaction promotes generated All/limit checks into an explicit manual selection.
    setSelectedIds((current) => transitionToManualSelection(clearScope, visibleVideos, current, id))
    setClearScope({ kind: 'manual' })
    setScopeInput(t.custom)
    setScopeMenuOpen(false)
    if (snapshot.state === 'completed') setCompletedControlDismissed(true)
  }

  const prepareClear = () => {
    if (clearTarget <= 0) return
    if (clearScope.kind === 'all') setPendingClear({ mode: 'all', count: clearTarget })
    else if (clearScope.kind === 'limit') setPendingClear({ mode: 'limited', count: clearTarget })
    else setPendingClear({ mode: 'selected', count: manualIdsForRemoval.length, ids: [...manualIdsForRemoval] })
  }

  const statusLabel = (status: VideoStatus) => ({
    pending: t.statusPending,
    processing: t.statusProcessing,
    completed: t.statusCompleted,
    failed: t.statusFailed,
  })[status]

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
    <main className="h-svh overflow-hidden bg-[#f4f5f7] p-2 text-zinc-950 sm:p-3">
      <div className="app-shell mx-auto flex h-full w-full max-w-[1560px] flex-col overflow-hidden rounded-[24px] border border-white/90 bg-white/70 p-2.5 shadow-[0_18px_65px_rgba(0,0,0,0.08)] backdrop-blur-2xl sm:rounded-[28px] sm:p-3">
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-4 px-2 sm:min-h-16 sm:px-3">
          <div className="flex min-w-0 items-baseline gap-3 sm:gap-5">
            <h1 className="shrink-0 text-[1.75rem] leading-none font-semibold tracking-[-0.055em]">Ebb</h1>
            <p className="truncate text-xs text-zinc-500 sm:text-sm">{t.subtitle}</p>
          </div>
          <Button variant="outline" className="h-9 shrink-0 rounded-xl border-zinc-200/90 bg-white/65 px-3 text-xs text-zinc-700 shadow-none" onClick={() => setLocale((current) => current === 'en' ? 'zh' : 'en')}>
            <Icon name="globe" className="size-4" />
            {locale === 'en' ? '中文' : 'English'}
          </Button>
        </header>

        <section className="status-rail mb-2.5 grid shrink-0 gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(220px,0.75fr)_minmax(260px,1fr)_auto] lg:items-center lg:gap-0">
          <div className="flex min-w-0 items-center gap-3 xl:pr-5">
            {account.avatar
              ? <img className="size-11 shrink-0 rounded-full border border-white object-cover shadow-sm" src={account.avatar} alt="" />
              : <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-zinc-100"><Icon name={account.state === 'checking' ? 'loader' : 'heart'} className={`size-5 text-zinc-500 ${account.state === 'checking' ? 'animate-spin' : ''}`} /></div>}
            <div className="min-w-0 flex-1">
              {!isSignedIn && <p className="text-[11px] font-medium text-zinc-500">Douyin</p>}
              <h2 className="truncate text-sm font-semibold tracking-[-0.015em]">{account.state === 'checking' ? t.checkingLogin : account.name ?? t.notSignedIn}</h2>
              {isSignedIn && <p className="mt-0.5 text-xs text-zinc-500">{likesDisplay} {t.likes}</p>}
            </div>
            {!isSignedIn && <Button className="h-9 shrink-0 rounded-xl bg-zinc-950 px-3 text-xs text-white hover:bg-zinc-800" disabled={busy || account.state === 'checking'} onClick={() => setLoginOpen(true)}><Icon name="globe" className="size-4" /> {t.login}</Button>}
            {isSignedIn && <Button variant="outline" className="h-9 shrink-0 rounded-xl border-zinc-200 bg-white/70 px-3 text-xs text-zinc-700 shadow-none" disabled={busy || isTaskActive} onClick={signOut}><Icon name="logout" className="size-4" /> {t.signOut}</Button>}
          </div>

          <div className="flex min-w-0 items-center gap-3 border-zinc-200/70 lg:border-l lg:pl-5 xl:pr-5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100/85 text-zinc-600">
              <Icon name={snapshot.state === 'paused' ? 'warning' : snapshot.state === 'completed' ? 'check' : 'shield'} className={`size-4.5 ${snapshot.state === 'paused' ? 'text-red-600' : snapshot.state === 'completed' ? 'text-emerald-600' : ''}`} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-950">{t.taskStates[snapshot.state]}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-zinc-500">{snapshot.message ?? t.privacy}</p>
            </div>
          </div>

          <div className="grid grid-cols-4 divide-x divide-zinc-200/70 rounded-xl border border-zinc-200/60 bg-white/45 px-1 py-2 lg:ml-4 lg:min-w-[310px]">
            {[
              [t.loaded, snapshot.counts.loaded],
              [t.selected, activeCount],
              [t.completed, snapshot.counts.completed],
              [t.failed, snapshot.counts.failed],
            ].map(([label, value], index) => <div className="px-2 text-center" key={label as string}>
              <p className={`text-sm font-semibold tracking-[-0.025em] ${index === 1 && Number(value) > 0 ? 'text-blue-600' : index === 2 && Number(value) > 0 ? 'text-emerald-600' : index === 3 && Number(value) > 0 ? 'text-red-600' : 'text-zinc-800'}`}>{value}</p>
              <p className="mt-0.5 truncate text-[10px] text-zinc-500">{label}</p>
            </div>)}
          </div>

        </section>

        <section className="table-surface flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200/75 px-3 py-2.5 sm:px-4">
              {isRemovalControlVisible
                ? <button type="button" className="removal-progress group" data-complete={snapshot.state === 'completed'} aria-label={snapshot.state === 'completed' ? t.reset : snapshot.state === 'paused' ? t.continue : t.pause} title={snapshot.state === 'completed' ? t.reset : snapshot.state === 'paused' ? t.continue : t.pause} disabled={busy || (snapshot.state === 'paused' && snapshot.mode === 'selected' && !manualIdsForRemoval.length)} onClick={handleRemovalControl}>
                    <span className="removal-progress-fill" style={{ width: `${removalPercent}%` }} />
                    {snapshot.state === 'completed'
                      ? <span className="removal-progress-action"><Icon name="check" className="size-4" /> 100%</span>
                      : snapshot.state === 'paused'
                      ? <span className="removal-progress-action"><Icon name="play" className="size-4" /> {t.continue}</span>
                      : <><span className="removal-progress-label">{t.removing} {completedInCurrentRun}/{snapshot.progress.total}</span><span className="removal-progress-action removal-progress-hover"><Icon name="pause" className="size-4" /></span></>}
                  </button>
                : <Button variant="destructive" className="h-9 rounded-xl bg-red-600 px-3 text-xs text-white shadow-[0_5px_14px_rgba(220,38,38,0.18)] hover:bg-red-700" disabled={!isSignedIn || isTaskLocked || busy || clearTarget <= 0} onClick={prepareClear}><Icon name="heart" className="size-4" /> {clearButtonLabel}</Button>}
              <Button variant="outline" className="h-9 rounded-xl border-zinc-200 bg-white/65 px-2.5 text-xs text-zinc-700 shadow-none" disabled={!['running', 'paused'].includes(snapshot.state) || busy} onClick={() => run(() => window.ebb.douyin.stop())}><Icon name="stop" className="size-4" /> {t.stop}</Button>
              <div ref={scopeControlRef} className="clear-scope-control">
                <div className="clear-scope-field" data-open={scopeMenuOpen}>
                  <input
                    aria-label={t.clearAmount}
                    aria-controls="clear-scope-menu"
                    aria-expanded={scopeMenuOpen}
                    aria-haspopup="listbox"
                    disabled={isTaskLocked || busy || !isSignedIn}
                    inputMode="numeric"
                    value={scopeInput}
                    onBlur={commitScopeInput}
                    onChange={(event) => setScopeInput(event.target.value.replace(/\D/g, ''))}
                    onClick={(event) => {
                      setScopeMenuOpen(true)
                      event.currentTarget.select()
                    }}
                    onFocus={(event) => {
                      setScopeMenuOpen(true)
                      event.currentTarget.select()
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        commitScopeInput()
                        event.currentTarget.blur()
                      } else if (event.key === 'Escape') {
                        setScopeMenuOpen(false)
                        event.currentTarget.blur()
                      }
                    }}
                  />
                  <button type="button" aria-label={t.quickSelect} disabled={isTaskLocked || busy || !isSignedIn} onMouseDown={(event) => event.preventDefault()} onClick={() => setScopeMenuOpen((current) => !current)}>
                    <Icon name="chevron" className={`size-4 transition-transform ${scopeMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                {scopeMenuOpen && <div id="clear-scope-menu" className="clear-scope-menu" role="listbox" aria-label={t.quickSelect}>
                  <p>{t.quickSelect}</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    <button type="button" role="option" aria-selected={clearScope.kind === 'all'} data-selected={clearScope.kind === 'all'} onMouseDown={(event) => event.preventDefault()} onClick={() => selectClearScope(DEFAULT_CLEAR_SCOPE)}>{t.all}</button>
                    {[10, 50, 100].map((amount) => <button type="button" role="option" aria-selected={clearScope.kind === 'limit' && clearScope.limit === amount} data-selected={clearScope.kind === 'limit' && clearScope.limit === amount} disabled={amount > totalLikes} key={amount} onMouseDown={(event) => event.preventDefault()} onClick={() => selectClearScope({ kind: 'limit', limit: amount })}>{amount}</button>)}
                  </div>
                  <span>{t.amountHint.replace('{count}', formatCount(totalLikes))}</span>
                </div>}
              </div>
              {clearScope.kind !== 'all' && <Button variant="outline" className="h-9 rounded-xl border-zinc-200 bg-white/60 px-2.5 text-xs text-zinc-600 shadow-none" disabled={isTaskLocked} onClick={resetClearScope}><Icon name="x" className="size-4" /> {t.reset}</Button>}
              <Button variant="outline" aria-label={t.refreshList} title={t.refreshList} className="ml-auto size-9 rounded-xl border-zinc-200 bg-white/60 p-0 text-zinc-700 shadow-none" disabled={!isSignedIn || busy || snapshot.state === 'running' || snapshot.state === 'paused' || snapshot.state === 'scanning' || snapshot.isLoadingMore} onClick={refreshVideos}>
                <Icon name="refresh" className={`size-5 ${snapshot.state === 'scanning' ? 'animate-spin' : ''}`} />
              </Button>
          </div>

          {visibleVideos.length ? <div ref={videoScrollRef} className="table-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto" onScroll={handleVideoScroll} onWheel={handleVideoWheel}>
            <table className="w-full table-fixed text-left text-sm">
              <colgroup><col className="w-11 sm:w-14" /><col className="w-8 sm:w-10" /><col /><col className="w-20 sm:w-28" /></colgroup>
              <thead className="sticky top-0 z-10 bg-white/92 text-[11px] font-medium tracking-[0.02em] text-zinc-500 backdrop-blur-xl">
                <tr><th className="px-3 py-2.5 sm:px-5" /><th className="px-1 py-2.5 text-center">#</th><th className="px-2 py-2.5 sm:px-3">{t.title}</th><th className="px-2 py-2.5 sm:px-3">{t.status}</th></tr>
              </thead>
              <tbody>
                {visibleVideos.map((video, index) => <tr className={`border-t border-zinc-100/90 transition-colors hover:bg-zinc-50/80 ${effectiveSelectedIds.has(video.id) ? 'bg-blue-50/65 hover:bg-blue-50/80' : ''} ${video.status === 'completed' ? 'video-row-removing' : ''}`} key={video.id} onAnimationEnd={() => video.status === 'completed' && dismissCompletedVideo(video.id)}>
                  <td className="px-3 py-2 sm:px-5"><input aria-label={video.title} className="video-checkbox" type="checkbox" checked={effectiveSelectedIds.has(video.id)} disabled={isTaskLocked || video.status === 'completed'} onChange={() => toggleVideo(video.id)} /></td>
                  <td className="px-1 py-2 text-center text-[11px] tabular-nums text-zinc-400">{index + 1}</td>
                  <td className="max-w-0 overflow-hidden px-2 py-2 sm:px-3"><div className="flex min-w-0 items-center gap-2 sm:gap-3">{video.thumbnail ? <img className="size-8 shrink-0 rounded-lg object-cover sm:size-10" src={video.thumbnail} alt="" /> : <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 sm:size-10"><Icon name="heart" className="size-4 text-zinc-400" /></div>}<span className="min-w-0 truncate text-[13px] font-medium text-zinc-800 sm:text-sm" title={video.title}>{video.title}</span></div></td>
                  <td className={`whitespace-nowrap px-2 py-2 text-xs font-medium sm:px-3 ${statusStyles[video.status]}`}>{video.status === 'processing' && <Icon name="loader" className="mr-1 size-3 animate-spin" />}{statusLabel(video.status)}</td>
                </tr>)}
              </tbody>
            </table>
          </div> : <div className="grid flex-1 place-items-center px-6 py-14 text-center"><div><div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-zinc-100"><Icon name="heart" className="size-5 text-zinc-500" /></div><h2 className="mt-4 text-base font-semibold">{t.emptyTitle}</h2><p className="mt-1 max-w-xs text-sm leading-5 text-zinc-500">{t.emptyBody}</p></div></div>}
          <div className="flex h-10 shrink-0 items-center border-t border-zinc-200/70 px-4 text-[11px] text-zinc-500">
            {snapshot.isLoadingMore ? <span className="flex items-center gap-2"><Icon name="loader" className="size-3.5 animate-spin" /> {t.loadingMore}</span> : !snapshot.hasMore && <span className="flex items-center gap-2"><Icon name="check" className="size-3.5 text-emerald-600" /> {t.allLoaded}</span>}
          </div>
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
