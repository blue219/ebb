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

const statusStyles = {
  pending: 'text-zinc-500',
  processing: 'text-zinc-900',
  completed: 'text-emerald-700',
  failed: 'text-red-600',
} as const

const FollowingRow = memo(function FollowingRow({
  item,
  index,
  selected,
  taskLocked,
  statusLabel,
  mutualLabel,
  followingLabel,
  onToggle,
  onDismiss,
}: {
  item: FollowingAccount
  index: number
  selected: boolean
  taskLocked: boolean
  statusLabel: string
  mutualLabel: string
  followingLabel: string
  onToggle: (id: string) => void
  onDismiss: (id: string) => void
}) {
  const identifier = item.uniqueId ? `@${item.uniqueId}` : `ID ${item.secUserId.slice(0, 10)}…`
  return <tr className={`border-t border-zinc-100/90 transition-colors hover:bg-zinc-50/80 ${selected ? 'bg-blue-50/65 hover:bg-blue-50/80' : ''} ${item.status === 'completed' ? 'video-row-removing' : ''}`} onAnimationEnd={() => item.status === 'completed' && onDismiss(item.secUserId)}>
    <td className="px-3 py-2 sm:px-5"><input aria-label={item.nickname} className="video-checkbox" type="checkbox" checked={selected} disabled={taskLocked || item.status === 'completed'} onChange={() => onToggle(item.secUserId)} /></td>
    <td className="px-1 py-2 text-center text-[11px] tabular-nums text-zinc-400">{index + 1}</td>
    <td className="max-w-0 overflow-hidden px-2 py-2 sm:px-3"><div className="flex min-w-0 items-center gap-2 sm:gap-3">{item.avatar ? <img className="size-8 shrink-0 rounded-full object-cover sm:size-10" src={item.avatar} alt="" loading="lazy" decoding="async" /> : <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 sm:size-10"><Icon name="users" className="size-4 text-zinc-400" /></div>}<div className="min-w-0"><p className="truncate text-[13px] font-medium text-zinc-800 sm:text-sm" title={item.nickname}>{item.nickname}</p><p className="truncate text-[10px] text-zinc-400 sm:hidden">{identifier}</p></div></div></td>
    <td className="hidden max-w-0 px-2 py-2 text-xs text-zinc-500 sm:table-cell sm:px-3"><span className="block truncate" title={identifier}>{identifier}</span></td>
    <td className="hidden whitespace-nowrap px-2 py-2 text-xs sm:table-cell sm:px-3"><span className={item.relation === 'mutual' ? 'font-medium text-blue-600' : 'text-zinc-500'}>{item.relation === 'mutual' ? mutualLabel : followingLabel}</span></td>
    <td className={`whitespace-nowrap px-2 py-2 text-xs font-medium sm:px-3 ${statusStyles[item.status]}`}>{item.status === 'processing' && <Icon name="loader" className="mr-1 size-3 animate-spin" />}{statusLabel}</td>
  </tr>
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
    () => snapshot.accounts.filter((item) => !dismissedIds.has(item.secUserId)),
    [dismissedIds, snapshot.accounts],
  )
  const selectableAccounts = useMemo(
    () => visibleAccounts.map((item) => ({ id: item.secUserId, status: item.status })),
    [visibleAccounts],
  )
  const manualIds = useMemo(
    () => visibleAccounts.filter((item) => selectedIds.has(item.secUserId)).map((item) => item.secUserId),
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
  const statusLabel = (status: FollowingAccount['status']) => status === 'pending'
    ? t.statusPending
    : status === 'processing'
      ? t.statusProcessing
      : status === 'completed'
        ? t.statusCompleted
        : t.statusFailed
  const confirmTitle = pendingUnfollow ? t.confirmUnfollowTitle.replace('{count}', formatCount(pendingUnfollow.count)) : ''
  const confirmBody = pendingUnfollow?.mode === 'all'
    ? t.confirmAllUnfollowBody
    : pendingUnfollow?.mode === 'limited'
      ? t.confirmLimitUnfollowBody.replace('{count}', formatCount(pendingUnfollow.count))
      : pendingUnfollow?.mode === 'selected'
        ? t.confirmManualUnfollowBody.replace('{count}', formatCount(pendingUnfollow.count))
        : ''

  return <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <div className="flex shrink-0 items-center gap-3 px-4 py-3 sm:px-6"><div className="min-w-0"><p className="truncate text-sm font-medium text-zinc-800">{t.followingTaskStates[snapshot.state]}</p><p className="mt-0.5 truncate text-xs text-zinc-500">{commandError ?? snapshot.message ?? t.privacy}</p></div></div>
    <section className="table-surface mx-4 mb-4 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden sm:mx-6 sm:mb-6">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200/75 px-3 py-2.5 sm:px-4">
        {showProgress ? <button type="button" className="removal-progress group" data-complete={snapshot.state === 'completed'} aria-label={snapshot.state === 'completed' ? t.reset : snapshot.state === 'paused' ? t.continue : t.pause} disabled={busy || (snapshot.state === 'paused' && snapshot.mode === 'selected' && !manualIds.length)} onClick={handleProgress}><span className="removal-progress-fill" style={{ width: `${percent}%` }} />{snapshot.state === 'completed' ? <span className="removal-progress-action"><Icon name="check" className="size-4" /> 100%</span> : snapshot.state === 'paused' ? <span className="removal-progress-action"><Icon name="play" className="size-4" /> {t.continue}</span> : <><span className="removal-progress-label">{t.unfollowing} {completed}/{snapshot.progress.total}</span><span className="removal-progress-action removal-progress-hover"><Icon name="pause" className="size-4" /></span></>}</button> : <Button variant="destructive" className="h-9 rounded-xl bg-red-600 px-3 text-xs text-white shadow-[0_5px_14px_rgba(220,38,38,0.18)] hover:bg-red-700" disabled={!isSignedIn || isTaskLocked || busy || target <= 0} onClick={prepare}><Icon name="users" className="size-4" /> {t.unfollowAccounts.replace('{count}', formatCount(target))}</Button>}
        <Button variant="outline" className="h-9 rounded-xl border-zinc-200 bg-white/65 px-2.5 text-xs text-zinc-700 shadow-none" disabled={!isTaskActive || busy} onClick={() => void run(() => window.ebb.douyin.following.stop())}><Icon name="stop" className="size-4" /> {t.stop}</Button>
        <div ref={scopeControlRef} className="batch-scope-control"><div className="batch-scope-field" data-open={scopeMenuOpen}><input aria-label={t.unfollowAmount} aria-controls="following-scope-menu" aria-expanded={scopeMenuOpen} aria-haspopup="listbox" disabled={isTaskLocked || busy || !isSignedIn} inputMode="numeric" value={scopeInput} onBlur={commitScopeInput} onChange={(event) => setScopeInput(event.target.value.replace(/\D/g, ''))} onClick={(event) => { setScopeMenuOpen(true); event.currentTarget.select() }} onFocus={(event) => { setScopeMenuOpen(true); event.currentTarget.select() }} onKeyDown={(event) => { if (event.key === 'Enter') { commitScopeInput(); event.currentTarget.blur() } else if (event.key === 'Escape') { setScopeMenuOpen(false); event.currentTarget.blur() } }} /><button type="button" aria-label={t.quickSelect} disabled={isTaskLocked || busy || !isSignedIn} onMouseDown={(event) => event.preventDefault()} onClick={() => setScopeMenuOpen((current) => !current)}><Icon name="chevron" className={`size-4 transition-transform ${scopeMenuOpen ? 'rotate-180' : ''}`} /></button></div>{scopeMenuOpen && <div id="following-scope-menu" className="batch-scope-menu" role="listbox" aria-label={t.quickSelect}><p>{t.quickSelect}</p><div className="grid grid-cols-4 gap-1.5"><button type="button" role="option" aria-selected={batchScope.kind === 'all'} data-selected={batchScope.kind === 'all'} onMouseDown={(event) => event.preventDefault()} onClick={() => selectScope(DEFAULT_BATCH_SCOPE)}>{t.all}</button>{[10, 50, 100].map((amount) => <button type="button" role="option" aria-selected={batchScope.kind === 'limit' && batchScope.limit === amount} data-selected={batchScope.kind === 'limit' && batchScope.limit === amount} disabled={amount > totalFollowing} key={amount} onMouseDown={(event) => event.preventDefault()} onClick={() => selectScope({ kind: 'limit', limit: amount })}>{amount}</button>)}</div><span>{t.amountHint.replace('{count}', formatCount(totalFollowing))}</span></div>}</div>
        {batchScope.kind !== 'all' && <Button variant="outline" className="h-9 rounded-xl border-zinc-200 bg-white/60 px-2.5 text-xs text-zinc-600 shadow-none" disabled={isTaskLocked} onClick={resetScope}><Icon name="x" className="size-4" /> {t.reset}</Button>}
        <Button variant="outline" aria-label={t.refreshFollowingList} title={t.refreshFollowingList} className="ml-auto size-9 rounded-xl border-zinc-200 bg-white/60 p-0 text-zinc-700 shadow-none" disabled={!isSignedIn || busy || isTaskLocked || snapshot.isLoadingMore || snapshot.isRefreshingCompletedList} onClick={() => void run(() => window.ebb.douyin.following.scan())}><Icon name="refresh" className={`size-5 ${snapshot.state === 'scanning' ? 'animate-spin' : ''}`} /></Button>
      </div>
      {visibleAccounts.length ? <div ref={scrollRef} className="table-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto" onScroll={handleScroll}><table className="w-full table-fixed text-left text-sm"><colgroup><col className="w-11 sm:w-14" /><col className="w-8 sm:w-10" /><col /><col className="hidden w-40 sm:table-column" /><col className="hidden w-28 sm:table-column" /><col className="w-20 sm:w-28" /></colgroup><thead className="sticky top-0 z-10 bg-white/92 text-[11px] font-medium tracking-[0.02em] text-zinc-500 backdrop-blur-xl"><tr><th className="px-3 py-2.5 sm:px-5" /><th className="px-1 py-2.5 text-center">#</th><th className="px-2 py-2.5 sm:px-3">{t.account}</th><th className="hidden px-2 py-2.5 sm:table-cell sm:px-3">{t.identifier}</th><th className="hidden px-2 py-2.5 sm:table-cell sm:px-3">{t.relationship}</th><th className="px-2 py-2.5 sm:px-3">{t.status}</th></tr></thead><tbody>{visibleAccounts.map((item, index) => <FollowingRow key={item.secUserId} item={item} index={index} selected={effectiveSelectedIds.has(item.secUserId)} taskLocked={isTaskLocked} statusLabel={statusLabel(item.status)} mutualLabel={t.mutual} followingLabel={t.followingOnly} onToggle={toggle} onDismiss={dismiss} />)}</tbody></table></div> : snapshot.isRefreshingCompletedList ? <div className="grid flex-1 place-items-center px-6 py-14 text-center"><div><Icon name="loader" className="mx-auto size-7 animate-spin text-zinc-400" /><h2 className="mt-4 text-base font-semibold">{t.refreshingCompletedFollowingList}</h2></div></div> : snapshot.completionRefreshError ? <div className="grid flex-1 place-items-center px-6 py-14 text-center"><div><Icon name="warning" className="mx-auto size-6 text-red-600" /><h2 className="mt-4 text-base font-semibold">{t.refreshCompletedFollowingListFailed}</h2><p className="mt-1 max-w-xs text-sm leading-5 text-zinc-500">{snapshot.completionRefreshError}</p><Button variant="outline" className="mt-4 rounded-xl border-zinc-200 bg-white/70 text-xs" disabled={busy} onClick={() => void run(() => window.ebb.douyin.following.refreshCompletedList())}><Icon name="refresh" className="size-4" /> {t.retryRefresh}</Button></div></div> : <div className="grid flex-1 place-items-center px-6 py-14 text-center"><div><div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-zinc-100"><Icon name="users" className="size-5 text-zinc-500" /></div><h2 className="mt-4 text-base font-semibold">{t.emptyFollowingTitle}</h2><p className="mt-1 max-w-xs text-sm leading-5 text-zinc-500">{t.emptyFollowingBody}</p></div></div>}
      <div className="flex h-10 shrink-0 items-center border-t border-zinc-200/70 px-4 text-[11px] text-zinc-500">{snapshot.isLoadingMore || snapshot.isRefreshingCompletedList ? <span className="flex items-center gap-2"><Icon name="loader" className="size-3.5 animate-spin" /> {snapshot.isRefreshingCompletedList ? t.refreshingCompletedFollowingList : t.loadingMoreFollowing}</span> : !snapshot.hasMore && <span className="flex items-center gap-2"><Icon name="check" className="size-3.5 text-emerald-600" /> {t.allFollowingLoaded}</span>}</div>
    </section>

    {pendingUnfollow && <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4 backdrop-blur-sm" role="presentation"><section aria-modal="true" role="dialog" aria-labelledby="confirm-unfollow-title" className="w-full max-w-md rounded-[24px] border border-white/80 bg-white/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.2)]"><Icon name="warning" className="size-6 text-red-600" /><h2 id="confirm-unfollow-title" className="mt-4 text-xl font-semibold tracking-[-0.035em]">{confirmTitle}</h2><p className="mt-2 text-sm leading-5 text-zinc-600">{confirmBody}</p><div className="mt-6 flex justify-end gap-2"><Button variant="outline" className="rounded-xl border-zinc-200" onClick={() => setPendingUnfollow(undefined)}>{t.cancel}</Button><Button variant="destructive" className="rounded-xl bg-red-600 text-white hover:bg-red-700" onClick={start}>{t.confirmUnfollow}</Button></div></section></div>}
  </section>
}
