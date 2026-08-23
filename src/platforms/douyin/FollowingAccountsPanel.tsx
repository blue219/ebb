import { memo, useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from 'react'

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
  AccountSnapshot,
  FollowingAccount,
  FollowingTaskSnapshot,
} from '../../../shared/platforms/douyin/contracts'
import { Icon } from './icons'
import { copy, type Locale } from './i18n'

type PendingUnfollow =
  | { mode: 'all'; count: number }
  | { mode: 'limited'; count: number }
  | { mode: 'selected'; count: number; ids: string[] }

type Props = {
  account: AccountSnapshot
  locale: Locale
  snapshot: FollowingTaskSnapshot
}

// Use the profile photo as the primary scan target while keeping each account's identity legible.
const FollowingAccountCard = memo(function FollowingAccountCard({
  item,
  selected,
  taskLocked,
  mutualLabel,
  followingLabel,
  onToggle,
  onDismiss,
}: {
  item: FollowingAccount
  selected: boolean
  taskLocked: boolean
  mutualLabel: string
  followingLabel: string
  onToggle: (id: string) => void
  onDismiss: (id: string) => void
}) {
  const identifier = item.username ? `@${item.username}` : `ID ${item.id.slice(0, 10)}…`
  const relationshipLabel = item.relation === 'mutual' ? mutualLabel : followingLabel
  return <label className={`following-account-card ${selected ? 'is-selected' : ''} ${item.status === 'completed' ? 'video-row-removing' : ''}`} onAnimationEnd={() => item.status === 'completed' && onDismiss(item.id)}>
    {item.avatar
      ? <img className="absolute inset-0 size-full object-cover" src={item.avatar} alt="" loading="lazy" decoding="async" />
      : <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-zinc-100 via-zinc-200 to-zinc-300"><Icon name="users" className="size-9 text-zinc-400" /></div>}
    <span className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/20 to-zinc-950/10" aria-hidden="true" />
    <input aria-label={item.displayName} className="video-cover-checkbox" type="checkbox" checked={selected} disabled={taskLocked || item.status === 'completed'} onChange={() => onToggle(item.id)} />
    <span className={`following-relation ${item.relation === 'mutual' ? 'is-mutual' : ''}`}>{relationshipLabel}</span>
    <span className="following-account-details"><span className="truncate text-sm font-semibold tracking-[-0.01em]">{item.displayName}</span><span className="truncate text-[11px] text-white/72" title={identifier}>{identifier}</span></span>
    {item.status === 'processing' && <span className="following-account-status" aria-label="Processing"><Icon name="loader" className="size-4 animate-spin" /></span>}
    {item.status === 'failed' && <span className="following-account-status is-failed" aria-label="Paused"><Icon name="warning" className="size-4" /></span>}
  </label>
})

export function FollowingAccountsPanel({ account, locale, snapshot }: Props) {
  const t = copy[locale]
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchScope, setBatchScope] = useState<BatchScope>(DEFAULT_BATCH_SCOPE)
  const [scopeInput, setScopeInput] = useState<string>(t.all)
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false)
  const [pendingUnfollow, setPendingUnfollow] = useState<PendingUnfollow>()
  const [busy, setBusy] = useState(false)
  const [commandError, setCommandError] = useState<string>()
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)
  const loadPendingRef = useRef(false)
  const scopeControlRef = useRef<HTMLDivElement>(null)
  const isSignedIn = account.state === 'signedIn'
  const isTaskActive = ['running', 'paused'].includes(snapshot.state)
  const isTaskLocked = ['running', 'paused', 'scanning'].includes(snapshot.state)
  const totalFollowing = account.followingCount ?? snapshot.counts.loaded
  const visibleAccounts = useMemo(
    () => snapshot.accounts.filter((item) => !dismissedIds.has(item.id)),
    [dismissedIds, snapshot.accounts],
  )
  const selectableAccounts = useMemo(
    () => visibleAccounts.map((item) => ({ id: item.id, status: item.status })),
    [visibleAccounts],
  )
  const manualIds = useMemo(
    () => visibleAccounts.filter((item) => selectedIds.has(item.id)).map((item) => item.id),
    [selectedIds, visibleAccounts],
  )
  const effectiveSelectedIds = useMemo(
    () => getScopeSelectedIds(batchScope, selectableAccounts, selectedIds),
    [batchScope, selectableAccounts, selectedIds],
  )
  const target = getBatchTarget(batchScope, totalFollowing, manualIds.length)
  const completed = snapshot.progress.completed
  const percent = snapshot.progress.total ? Math.min(100, Math.round((completed / snapshot.progress.total) * 100)) : 0
  const showProgress = ['running', 'paused', 'completed'].includes(snapshot.state) && snapshot.progress.total > 0
  const activeCount = showProgress ? snapshot.progress.total : target

  useEffect(() => {
    if (batchScope.kind === 'all') setScopeInput(t.all)
    else if (batchScope.kind === 'manual') setScopeInput(t.custom)
  }, [batchScope.kind, t.all, t.custom])

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!scopeControlRef.current?.contains(event.target as Node)) setScopeMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

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
    setScopeInput(scope.kind === 'all' ? t.all : scope.kind === 'manual' ? t.custom : String(scope.limit))
    if (scope.kind !== 'manual') setSelectedIds(new Set())
    setScopeMenuOpen(false)
  }

  const resetScope = () => selectScope(DEFAULT_BATCH_SCOPE)

  const commitScopeInput = () => {
    if (scopeInput === t.all || scopeInput === t.custom) return
    const parsed = Number(scopeInput)
    if (!scopeInput.trim() || !Number.isFinite(parsed)) {
      resetScope()
      return
    }
    const limit = clampBatchLimit(parsed, totalFollowing)
    if (limit > 0) selectScope({ kind: 'limit', limit })
  }

  const toggle = useCallback((id: string) => {
    if (isTaskLocked) return
    setSelectedIds((current) => transitionToManualSelection(batchScope, selectableAccounts, current, id))
    setBatchScope({ kind: 'manual' })
    setScopeInput(t.custom)
  }, [batchScope, isTaskLocked, selectableAccounts, t.custom])

  const dismiss = useCallback((id: string) => {
    setDismissedIds((current) => new Set(current).add(id))
  }, [])

  const prepare = () => {
    if (batchScope.kind === 'all') setPendingUnfollow({ mode: 'all', count: target })
    else if (batchScope.kind === 'limit') setPendingUnfollow({ mode: 'limited', count: target })
    else setPendingUnfollow({ mode: 'selected', count: manualIds.length, ids: [...manualIds] })
  }

  const start = () => {
    const request = pendingUnfollow
    setPendingUnfollow(undefined)
    if (request?.mode === 'all') void run(() => window.ebb.douyin.following.startAll())
    else if (request?.mode === 'limited') void run(() => window.ebb.douyin.following.startAll(request.count))
    else if (request?.mode === 'selected') void run(() => window.ebb.douyin.following.start(request.ids))
  }

  const handleProgress = () => {
    if (snapshot.state === 'completed') {
      resetScope()
      setDismissedIds(new Set())
    } else if (snapshot.state === 'running') {
      void run(() => window.ebb.douyin.following.pause())
    } else if (snapshot.state === 'paused' && (snapshot.mode !== 'selected' || manualIds.length)) {
      void run(() => window.ebb.douyin.following.resume(manualIds))
    }
  }

  const loadMore = () => {
    if (loadPendingRef.current || !snapshot.hasMore || snapshot.isLoadingMore || isTaskActive) return
    loadPendingRef.current = true
    void window.ebb.douyin.following.loadMore().finally(() => { loadPendingRef.current = false })
  }

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const targetElement = event.currentTarget
    if (targetElement.scrollHeight - targetElement.scrollTop - targetElement.clientHeight < 140) loadMore()
  }

  const formatCount = (count: number) => count.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')
  const confirmTitle = pendingUnfollow ? t.confirmUnfollowTitle.replace('{count}', formatCount(pendingUnfollow.count)) : ''
  const confirmBody = pendingUnfollow?.mode === 'all'
    ? t.confirmAllUnfollowBody
    : pendingUnfollow?.mode === 'limited'
      ? t.confirmLimitUnfollowBody.replace('{count}', formatCount(pendingUnfollow.count))
      : pendingUnfollow?.mode === 'selected'
        ? t.confirmManualUnfollowBody.replace('{count}', formatCount(pendingUnfollow.count))
        : ''

  return <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <span className="sr-only" role="status">{t.followingTaskStates[snapshot.state]}</span>
    <span className="sr-only" role="status">{commandError ?? snapshot.message ?? t.privacy}</span>

    {visibleAccounts.length ? <div ref={scrollRef} className="table-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-28" onScroll={handleScroll}><div className="following-account-grid">{visibleAccounts.map((item) => <FollowingAccountCard key={item.id} item={item} selected={effectiveSelectedIds.has(item.id)} taskLocked={isTaskLocked} mutualLabel={t.mutual} followingLabel={t.followingOnly} onToggle={toggle} onDismiss={dismiss} />)}</div><div className="flex h-10 items-center px-4 text-[11px] text-zinc-500">{snapshot.isLoadingMore || snapshot.isRefreshingCompletedList ? <span className="flex items-center gap-2"><Icon name="loader" className="size-3.5 animate-spin" /> {snapshot.isRefreshingCompletedList ? t.refreshingCompletedFollowingList : t.loadingMoreFollowing}</span> : !snapshot.hasMore && <span className="flex items-center gap-2"><Icon name="check" className="size-3.5 text-emerald-600" /> {t.allFollowingLoaded}</span>}</div></div> : snapshot.isRefreshingCompletedList ? <div className="grid flex-1 place-items-center px-6 py-14 text-center"><div><Icon name="loader" className="mx-auto size-7 animate-spin text-zinc-400" /><h2 className="mt-4 text-base font-semibold">{t.refreshingCompletedFollowingList}</h2></div></div> : snapshot.completionRefreshError ? <div className="grid flex-1 place-items-center px-6 py-14 text-center"><div><Icon name="warning" className="mx-auto size-6 text-red-600" /><h2 className="mt-4 text-base font-semibold">{t.refreshCompletedFollowingListFailed}</h2><p className="mt-1 max-w-xs text-sm leading-5 text-zinc-500">{snapshot.completionRefreshError}</p><Button variant="outline" className="mt-4 rounded-xl border-zinc-200 bg-white/70 text-xs" disabled={busy} onClick={() => void run(() => window.ebb.douyin.following.refreshCompletedList())}><Icon name="refresh" className="size-4" /> {t.retryRefresh}</Button></div></div> : <div className="grid flex-1 place-items-center px-6 py-14 text-center"><div><div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-zinc-100"><Icon name="users" className="size-5 text-zinc-500" /></div><h2 className="mt-4 text-base font-semibold">{t.emptyFollowingTitle}</h2><p className="mt-1 max-w-xs text-sm leading-5 text-zinc-500">{t.emptyFollowingBody}</p></div></div>}

    <div className="floating-action-bar">
      <span className="px-2 text-sm font-medium text-zinc-600">{t.selected} {formatCount(activeCount)}</span>
      <div ref={scopeControlRef} className="batch-scope-control"><div className="batch-scope-field" data-open={scopeMenuOpen}><input aria-label={t.unfollowAmount} aria-controls="following-scope-menu" aria-expanded={scopeMenuOpen} aria-haspopup="listbox" disabled={isTaskLocked || busy || !isSignedIn} inputMode="numeric" value={scopeInput} onBlur={commitScopeInput} onChange={(event) => setScopeInput(event.target.value.replace(/\D/g, ''))} onClick={(event) => { setScopeMenuOpen(true); event.currentTarget.select() }} onFocus={(event) => { setScopeMenuOpen(true); event.currentTarget.select() }} onKeyDown={(event) => { if (event.key === 'Enter') { commitScopeInput(); event.currentTarget.blur() } else if (event.key === 'Escape') { setScopeMenuOpen(false); event.currentTarget.blur() } }} /><button type="button" aria-label={t.quickSelect} disabled={isTaskLocked || busy || !isSignedIn} onMouseDown={(event) => event.preventDefault()} onClick={() => setScopeMenuOpen((current) => !current)}><Icon name="chevron" className={`size-4 transition-transform ${scopeMenuOpen ? 'rotate-180' : ''}`} /></button></div>{scopeMenuOpen && <div id="following-scope-menu" className="batch-scope-menu" role="listbox" aria-label={t.quickSelect}><p>{t.quickSelect}</p><div className="grid grid-cols-4 gap-1.5"><button type="button" role="option" aria-selected={batchScope.kind === 'all'} data-selected={batchScope.kind === 'all'} onMouseDown={(event) => event.preventDefault()} onClick={() => selectScope(DEFAULT_BATCH_SCOPE)}>{t.all}</button>{[10, 50, 100].map((amount) => <button type="button" role="option" aria-selected={batchScope.kind === 'limit' && batchScope.limit === amount} data-selected={batchScope.kind === 'limit' && batchScope.limit === amount} disabled={amount > totalFollowing} key={amount} onMouseDown={(event) => event.preventDefault()} onClick={() => selectScope({ kind: 'limit', limit: amount })}>{amount}</button>)}</div><span>{t.amountHint.replace('{count}', formatCount(totalFollowing))}</span></div>}</div>
      {batchScope.kind !== 'all' && <Button variant="outline" className="h-11 rounded-xl border-zinc-200 bg-white/65 px-3.5 text-sm text-zinc-600 shadow-none" disabled={isTaskLocked} onClick={resetScope}><Icon name="x" className="size-4" /> {t.reset}</Button>}
      {showProgress ? <button type="button" className="removal-progress group" data-complete={snapshot.state === 'completed'} aria-label={snapshot.state === 'completed' ? t.reset : snapshot.state === 'paused' ? t.continue : t.pause} title={snapshot.state === 'completed' ? t.reset : snapshot.state === 'paused' ? t.continue : t.pause} disabled={busy || (snapshot.state === 'paused' && snapshot.mode === 'selected' && !manualIds.length)} onClick={handleProgress}><span className="removal-progress-fill" style={{ width: `${percent}%` }} />{snapshot.state === 'completed' ? <span className="removal-progress-action"><Icon name="check" className="size-4" /> 100%</span> : snapshot.state === 'paused' ? <span className="removal-progress-action"><Icon name="play" className="size-4" /> {t.continue}</span> : <><span className="removal-progress-label">{t.unfollowing} {completed}/{snapshot.progress.total}</span><span className="removal-progress-action removal-progress-hover"><Icon name="pause" className="size-4" /></span></>}</button> : <Button variant="destructive" className="h-11 rounded-xl bg-red-600 px-4 text-sm text-white shadow-[0_5px_14px_rgba(220,38,38,0.18)] hover:bg-red-700" disabled={!isSignedIn || isTaskLocked || busy || target <= 0} onClick={prepare}><Icon name="users" className="size-4" /> {t.unfollowAccounts.replace('{count}', formatCount(target))}</Button>}
      <Button variant="outline" className="h-11 rounded-xl border-zinc-200 bg-white/65 px-3.5 text-sm text-zinc-700 shadow-none" disabled={!isTaskActive || busy} onClick={() => void run(() => window.ebb.douyin.following.stop())}><Icon name="stop" className="size-4" /> {t.stop}</Button>
    </div>

    {pendingUnfollow && <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4 backdrop-blur-sm" role="presentation"><section aria-modal="true" role="dialog" aria-labelledby="confirm-unfollow-title" className="w-full max-w-md rounded-[24px] border border-white/80 bg-white/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.2)]"><Icon name="warning" className="size-6 text-red-600" /><h2 id="confirm-unfollow-title" className="mt-4 text-xl font-semibold tracking-[-0.035em]">{confirmTitle}</h2><p className="mt-2 text-sm leading-5 text-zinc-600">{confirmBody}</p><div className="mt-6 flex justify-end gap-2"><Button variant="outline" className="rounded-xl border-zinc-200" onClick={() => setPendingUnfollow(undefined)}>{t.cancel}</Button><Button variant="destructive" className="rounded-xl bg-red-600 text-white hover:bg-red-700" onClick={start}>{t.confirmUnfollow}</Button></div></section></div>}
  </section>
}
