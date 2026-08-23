import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from 'react'

import { Button } from '@/components/ui/button'
import {
  DEFAULT_BATCH_SCOPE,
  clampBatchLimit,
  getBatchTarget,
  getScopeSelectedIds,
  transitionToManualSelection,
  type BatchScope,
} from '@/shared/batch-scope'
import type { AccountSnapshot, DouyinVideo, TaskSnapshot } from '../../../shared/platforms/douyin/contracts'
import type { PlatformBridge, PlatformId } from '../../../shared/platforms/contracts'
import { Icon } from './icons'
import { getPlatformCopy, type Locale } from './i18n'
import { VideoRow } from './VideoRow'

type PendingUncollect =
  | { mode: 'all'; count: number }
  | { mode: 'limited'; count: number }
  | { mode: 'selected'; count: number; ids: string[] }

type Props = {
  account: AccountSnapshot
  bridge: PlatformBridge
  locale: Locale
  platform: PlatformId
  snapshot: TaskSnapshot
}

export function CollectedVideosPanel({ account, bridge, locale, platform, snapshot }: Props) {
  const t = getPlatformCopy(locale, platform)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [manualTarget, setManualTarget] = useState(0)
  const [batchScope, setBatchScope] = useState<BatchScope>(DEFAULT_BATCH_SCOPE)
  const [scopeInput, setScopeInput] = useState<string>(t.all)
  const [pendingUncollect, setPendingUncollect] = useState<PendingUncollect>()
  const [busy, setBusy] = useState(false)
  const [commandError, setCommandError] = useState<string>()
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const loadPendingRef = useRef(false)
  const isSignedIn = account.state === 'signedIn'
  const isTaskActive = ['running', 'paused'].includes(snapshot.state)
  const isTaskLocked = ['running', 'paused', 'scanning'].includes(snapshot.state)
  const visibleVideos = useMemo(
    () => snapshot.videos.filter((video) => !dismissedIds.has(video.id)),
    [dismissedIds, snapshot.videos],
  )
  const loadedPendingCount = visibleVideos.filter((video) => video.status !== 'completed').length
  const totalCollections = account.collectedVideosCount
  const effectiveSelectedIds = useMemo(
    () => getScopeSelectedIds(batchScope, visibleVideos, selectedIds),
    [batchScope, selectedIds, visibleVideos],
  )
  const selectedVideoIds = useMemo(() => [...effectiveSelectedIds], [effectiveSelectedIds])
  const target = batchScope.kind === 'manual'
    ? manualTarget
    : Math.max(
      batchScope.kind === 'all' && totalCollections === undefined
        ? loadedPendingCount
        : getBatchTarget(batchScope, totalCollections, selectedVideoIds.length),
      effectiveSelectedIds.size,
    )
  const completed = snapshot.progress.completed
  const percent = snapshot.progress.total ? Math.min(100, Math.round((completed / snapshot.progress.total) * 100)) : 0
  const showProgress = ['running', 'paused', 'completed'].includes(snapshot.state)
    && (snapshot.progress.total === null || snapshot.progress.total > 0)
  const activeCount = showProgress ? snapshot.progress.total ?? completed : target

  useEffect(() => {
    setScopeInput(batchScope.kind === 'all' ? t.all : batchScope.kind === 'manual' ? t.custom : String(batchScope.limit))
  }, [batchScope, t.all, t.custom])

  const run = async (operation: () => Promise<void>) => {
    setBusy(true)
    setCommandError(undefined)
    try {
      await operation()
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : 'An unexpected command error occurred.')
    } finally {
      setBusy(false)
    }
  }

  const selectScope = (scope: BatchScope) => {
    setBatchScope(scope)
    if (scope.kind !== 'manual') {
      setSelectedIds(new Set())
      setManualTarget(0)
    }
  }

  const resetScope = () => {
    selectScope(DEFAULT_BATCH_SCOPE)
    setDismissedIds(new Set())
  }

  const commitScopeInput = () => {
    if (scopeInput === t.all || scopeInput === t.custom) return
    const parsed = Number(scopeInput)
    if (!scopeInput.trim() || !Number.isFinite(parsed)) {
      resetScope()
      return
    }
    const limit = clampBatchLimit(parsed, totalCollections)
    if (limit > 0) selectScope({ kind: 'limit', limit })
  }

  const toggle = useCallback((id: string) => {
    if (isTaskLocked) return
    setSelectedIds((current) => {
      const next = transitionToManualSelection(batchScope, visibleVideos, current, id)
      setManualTarget(next.size)
      return next
    })
    setBatchScope({ kind: 'manual' })
  }, [batchScope, isTaskLocked, visibleVideos])

  const dismiss = useCallback((id: string) => {
    setDismissedIds((current) => new Set(current).add(id))
    setSelectedIds((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }, [])

  const prepare = () => {
    if (batchScope.kind === 'all') setPendingUncollect({ mode: 'all', count: target })
    else if (batchScope.kind === 'limit') setPendingUncollect({ mode: 'limited', count: target })
    else setPendingUncollect({ mode: 'selected', count: selectedVideoIds.length, ids: selectedVideoIds })
  }

  const start = () => {
    const request = pendingUncollect
    setPendingUncollect(undefined)
    if (request?.mode === 'all') void run(() => bridge.collection.startAll())
    else if (request?.mode === 'limited') void run(() => bridge.collection.startAll(request.count))
    else if (request?.mode === 'selected') void run(() => bridge.collection.start(request.ids))
  }

  const handleProgress = () => {
    if (snapshot.state === 'completed') {
      resetScope()
    } else if (snapshot.state === 'running') {
      void run(() => bridge.collection.pause())
    } else if (snapshot.state === 'paused' && (snapshot.mode !== 'selected' || selectedVideoIds.length)) {
      void run(() => bridge.collection.resume(selectedVideoIds))
    }
  }

  const loadMore = () => {
    if (loadPendingRef.current || !snapshot.hasMore || snapshot.isLoadingMore || isTaskActive) return
    loadPendingRef.current = true
    void bridge.collection.loadMore().finally(() => { loadPendingRef.current = false })
  }

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 140) loadMore()
  }

  const formatCount = (count: number) => count.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')
  const confirmTitle = pendingUncollect ? t.confirmUncollectTitle.replace('{count}', formatCount(pendingUncollect.count)) : ''
  const confirmBody = pendingUncollect?.mode === 'all'
    ? t.confirmAllUncollectBody
    : pendingUncollect?.mode === 'limited'
      ? t.confirmLimitUncollectBody.replace('{count}', formatCount(pendingUncollect.count))
      : pendingUncollect?.mode === 'selected'
        ? t.confirmManualUncollectBody.replace('{count}', formatCount(pendingUncollect.count))
        : ''

  return <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <span className="sr-only" role="status">{t.collectionTaskStates[snapshot.state]}</span>
    <span className="sr-only" role="status">{commandError ?? snapshot.message ?? t.privacy}</span>

    {visibleVideos.length ? <div className="table-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-28" onScroll={handleScroll}><div className="video-cover-grid">{visibleVideos.map((video: DouyinVideo) => <VideoRow key={video.id} {...video} selected={effectiveSelectedIds.has(video.id)} taskLocked={isTaskLocked} onToggle={toggle} onDismiss={dismiss} />)}</div><div className="flex h-10 items-center px-4 text-[11px] text-zinc-500">{snapshot.isLoadingMore || snapshot.isRefreshingCompletedList ? <span className="flex items-center gap-2"><Icon name="loader" className="size-3.5 animate-spin" /> {snapshot.isRefreshingCompletedList ? t.refreshingCompletedCollectionList : t.loadingMore}</span> : !snapshot.hasMore && <span className="flex items-center gap-2"><Icon name="check" className="size-3.5 text-emerald-600" /> {t.allCollectionsLoaded}</span>}</div></div> : snapshot.isRefreshingCompletedList ? <div className="grid flex-1 place-items-center px-6 py-14 text-center"><div><Icon name="loader" className="mx-auto size-7 animate-spin text-zinc-400" /><h2 className="mt-4 text-base font-semibold">{t.refreshingCompletedCollectionList}</h2></div></div> : snapshot.completionRefreshError ? <div className="grid flex-1 place-items-center px-6 py-14 text-center"><div><Icon name="warning" className="mx-auto size-6 text-red-600" /><h2 className="mt-4 text-base font-semibold">{t.refreshCompletedCollectionListFailed}</h2><p className="mt-1 max-w-xs text-sm leading-5 text-zinc-500">{snapshot.completionRefreshError}</p><Button variant="outline" className="mt-4 rounded-xl border-zinc-200 bg-white/70 text-xs" disabled={busy} onClick={() => void run(() => bridge.collection.refreshCompletedList())}><Icon name="refresh" className="size-4" /> {t.retryRefresh}</Button></div></div> : <div className="grid flex-1 place-items-center px-6 py-14 text-center"><div><div className="mx-auto grid size-11 place-items-center rounded-2xl bg-zinc-100"><Icon name="heart" className="size-5 text-zinc-500" /></div><h2 className="mt-4 text-base font-semibold">{t.emptyCollectionTitle}</h2><p className="mt-1 max-w-xs text-sm leading-5 text-zinc-500">{t.emptyCollectionBody}</p></div></div>}

    <div className="floating-action-bar">
      <span className="px-2 text-sm font-medium text-zinc-600">{t.selected} {formatCount(activeCount)}</span>
      <input aria-label={t.uncollectAmount} className="h-11 w-28 rounded-xl border border-zinc-200 bg-white/65 px-3 text-sm text-zinc-700 outline-none focus:border-zinc-400" disabled={isTaskLocked || busy || !isSignedIn} inputMode="numeric" value={scopeInput} onBlur={commitScopeInput} onChange={(event) => setScopeInput(event.target.value.replace(/\D/g, ''))} onKeyDown={(event) => { if (event.key === 'Enter') { commitScopeInput(); event.currentTarget.blur() } }} />
      {batchScope.kind !== 'all' && <Button variant="outline" className="h-11 rounded-xl border-zinc-200 bg-white/65 px-3.5 text-sm text-zinc-600 shadow-none" disabled={isTaskLocked} onClick={resetScope}><Icon name="x" className="size-4" /> {t.reset}</Button>}
      {showProgress ? <button type="button" className="removal-progress group" data-complete={snapshot.state === 'completed'} aria-label={snapshot.state === 'completed' ? t.reset : snapshot.state === 'paused' ? t.continue : t.pause} disabled={busy || (snapshot.state === 'paused' && snapshot.mode === 'selected' && !selectedVideoIds.length)} onClick={handleProgress}><span className="removal-progress-fill" style={{ width: `${percent}%` }} />{snapshot.state === 'completed' ? <span className="removal-progress-action"><Icon name="check" className="size-4" /> {snapshot.progress.total === null ? formatCount(completed) : '100%'}</span> : snapshot.state === 'paused' ? <span className="removal-progress-action"><Icon name="play" className="size-4" /> {t.continue}</span> : <><span className="removal-progress-label">{snapshot.progress.total === null ? t.processedCount.replace('{count}', formatCount(completed)) : `${t.uncollecting} ${completed}/${snapshot.progress.total}`}</span><span className="removal-progress-action removal-progress-hover"><Icon name="pause" className="size-4" /></span></>}</button> : <Button variant="destructive" className="h-11 rounded-xl bg-red-600 px-4 text-sm text-white shadow-[0_5px_14px_rgba(220,38,38,0.18)] hover:bg-red-700" disabled={!isSignedIn || isTaskLocked || busy || target <= 0} onClick={prepare}><Icon name="heart" className="size-4" /> {t.uncollectVideos.replace('{count}', formatCount(target))}</Button>}
      <Button variant="outline" className="h-11 rounded-xl border-zinc-200 bg-white/65 px-3.5 text-sm text-zinc-700 shadow-none" disabled={!isTaskActive || busy} onClick={() => void run(() => bridge.collection.stop())}><Icon name="stop" className="size-4" /> {t.stop}</Button>
    </div>

    {pendingUncollect && <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4 backdrop-blur-sm" role="presentation"><section aria-modal="true" role="dialog" aria-labelledby="confirm-uncollect-title" className="w-full max-w-md rounded-[24px] border border-white/80 bg-white/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.2)]"><Icon name="warning" className="size-6 text-red-600" /><h2 id="confirm-uncollect-title" className="mt-4 text-xl font-semibold tracking-[-0.035em]">{confirmTitle}</h2><p className="mt-2 text-sm leading-5 text-zinc-600">{confirmBody}</p><div className="mt-6 flex justify-end gap-2"><Button variant="outline" className="rounded-xl border-zinc-200" onClick={() => setPendingUncollect(undefined)}>{t.cancel}</Button><Button variant="destructive" className="rounded-xl bg-red-600 text-white hover:bg-red-700" onClick={start}>{t.confirmUncollect}</Button></div></section></div>}
  </section>
}
