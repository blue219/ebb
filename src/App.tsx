import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { copy, type Locale } from '@/lib/i18n'

const initialSnapshot: TaskSnapshot = {
  state: 'idle',
  videos: [],
  counts: { loaded: 0, selected: 0, completed: 0, failed: 0 },
}

const statusStyles: Record<VideoStatus, string> = {
  pending: 'text-zinc-500',
  processing: 'text-zinc-900',
  completed: 'text-emerald-700',
  failed: 'text-red-600',
}

type IconName = 'arrow' | 'check' | 'globe' | 'heart' | 'loader' | 'logout' | 'pause' | 'play' | 'search' | 'shield' | 'stop' | 'warning' | 'x'

function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const props = { className: `inline-block shrink-0 ${className}`, fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (name === 'arrow') return <svg {...props}><path d="M7 17 17 7M9 7h8v8" /></svg>
  if (name === 'check') return <svg {...props}><path d="m5 12 4 4L19 6" /></svg>
  if (name === 'globe') return <svg {...props}><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2.2 2.2 3.2 5 3.2 8S14.2 17.8 12 20c-2.2-2.2-3.2-5-3.2-8S9.8 6.2 12 4" /></svg>
  if (name === 'heart') return <svg {...props}><path d="M20.8 8.6c0 5.2-8.8 10.2-8.8 10.2S3.2 13.8 3.2 8.6A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8.8 1.9ZM4 4l16 16" /></svg>
  if (name === 'loader') return <svg {...props}><path d="M20 12a8 8 0 1 1-2.3-5.7" /></svg>
  if (name === 'logout') return <svg {...props}><path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M14 8l4 4-4 4M18 12H9" /></svg>
  if (name === 'pause') return <svg {...props}><circle cx="12" cy="12" r="8" /><path d="M10 9v6M14 9v6" /></svg>
  if (name === 'play') return <svg {...props}><circle cx="12" cy="12" r="8" /><path d="m10 9 5 3-5 3Z" /></svg>
  if (name === 'search') return <svg {...props}><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" /></svg>
  if (name === 'shield') return <svg {...props}><path d="M12 3 19 6v5c0 4.6-3 7.8-7 10-4-2.2-7-5.4-7-10V6l7-3Z" /><path d="m8.7 12 2.1 2.1 4.5-4.4" /></svg>
  if (name === 'stop') return <svg {...props}><circle cx="12" cy="12" r="8" /><path d="M9 9h6v6H9z" /></svg>
  if (name === 'warning') return <svg {...props}><path d="m12 4 8 15H4L12 4Z" /><path d="M12 9v4M12 16h.01" /></svg>
  return <svg {...props}><path d="m7 7 10 10M17 7 7 17" /></svg>
}

function App() {
  const [locale, setLocale] = useState<Locale>('en')
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const t = copy[locale]

  useEffect(() => window.ebb?.douyin.onStatus(setSnapshot), [])

  const visibleVideos = useMemo(() => snapshot.videos.filter((video) => {
    const matchesQuery = video.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())
    return matchesQuery && (!selectedOnly || selectedIds.has(video.id))
  }), [query, selectedIds, selectedOnly, snapshot.videos])

  const selectedCount = selectedIds.size
  const activeCount = snapshot.videos.filter((video) => selectedIds.has(video.id)).length
  const isTaskActive = snapshot.state === 'running' || snapshot.state === 'scanning'

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

  const toggleVideo = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current)
      const allVisibleSelected = visibleVideos.length > 0 && visibleVideos.every((video) => next.has(video.id))
      for (const video of visibleVideos) {
        if (allVisibleSelected) next.delete(video.id)
        else next.add(video.id)
      }
      return next
    })
  }

  const statusLabel = (status: VideoStatus) => ({
    pending: t.statusPending,
    processing: t.statusProcessing,
    completed: t.statusCompleted,
    failed: t.statusFailed,
  })[status]

  return (
    <main className="min-h-svh bg-[#f5f5f7] p-3 text-zinc-950 sm:p-5">
      <div className="app-shell mx-auto flex min-h-[calc(100svh-1.5rem)] w-full max-w-[1480px] flex-col overflow-hidden rounded-[30px] border border-white/80 bg-white/75 p-5 shadow-[0_18px_65px_rgba(0,0,0,0.08)] backdrop-blur-2xl sm:min-h-[calc(100svh-2.5rem)] sm:p-7">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200/80 pb-5">
          <div>
            <h1 className="text-[2rem] leading-none font-semibold tracking-[-0.055em]">Ebb</h1>
            <p className="mt-2 text-sm text-zinc-500">{t.subtitle}</p>
          </div>
          <Button variant="outline" className="h-9 rounded-full border-zinc-200 bg-white/70 px-3 text-zinc-700" onClick={() => setLocale((current) => current === 'en' ? 'zh' : 'en')}>
            <Icon name="globe" className="size-4" />
            {locale === 'en' ? '中文' : 'English'}
          </Button>
        </header>

        <section className="grid gap-4 py-5 lg:grid-cols-[minmax(270px,0.75fr)_minmax(420px,1.6fr)_minmax(260px,0.7fr)]">
          <div className="glass-panel flex min-h-44 flex-col justify-between p-5">
            <div>
              <Icon name="heart" className="mb-5 size-6 text-zinc-900" />
              <h2 className="text-lg font-semibold tracking-[-0.025em]">Douyin</h2>
              <p className="mt-1.5 text-sm leading-5 text-zinc-500">{t.workspaceHint}</p>
            </div>
            <div className="mt-5 flex gap-2">
              <Button className="h-9 flex-1 rounded-xl bg-zinc-950 text-white hover:bg-zinc-800" disabled={busy} onClick={() => run(() => window.ebb.douyin.open())}>
                <Icon name="arrow" className="size-4" /> {t.open}
              </Button>
              <Button variant="outline" className="h-9 rounded-xl border-zinc-200 bg-white/80 text-zinc-900" disabled={busy || isTaskActive} onClick={() => run(() => window.ebb.douyin.scan())}>
                {snapshot.state === 'scanning' ? <Icon name="loader" className="size-4 animate-spin" /> : <Icon name="search" className="size-4" />}
                {snapshot.videos.length ? t.rescan : t.scan}
              </Button>
            </div>
          </div>

          <div className="glass-panel flex min-h-44 flex-col justify-between p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-zinc-950">{t.taskStates[snapshot.state]}</p>
                <p className="mt-1 text-sm text-zinc-500">{snapshot.message ?? t.privacy}</p>
              </div>
              {snapshot.state === 'paused' && <Icon name="warning" className="size-6 shrink-0 text-red-600" />}
              {snapshot.state === 'completed' && <Icon name="check" className="size-6 shrink-0 text-emerald-600" />}
            </div>
            <div className="mt-5 grid grid-cols-4 divide-x divide-zinc-200/80">
              {[
                [t.loaded, snapshot.counts.loaded],
                [t.selected, activeCount],
                [t.completed, snapshot.counts.completed],
                [t.failed, snapshot.counts.failed],
              ].map(([label, value]) => <div className="px-3 first:pl-0 last:pr-0" key={label as string}>
                <p className="text-[11px] font-medium tracking-[0.02em] text-zinc-500">{label}</p>
                <p className="mt-1 text-xl font-semibold tracking-[-0.035em]">{value}</p>
              </div>)}
            </div>
          </div>

          <div className="glass-panel flex min-h-44 flex-col justify-between p-5">
            <Icon name="shield" className="size-6 text-zinc-900" />
            <p className="mt-4 text-sm leading-5 text-zinc-600">{t.privacy}</p>
            <Button variant="ghost" className="mt-3 h-8 w-fit rounded-lg px-0 text-zinc-600 hover:bg-transparent hover:text-zinc-950" disabled={busy} onClick={() => run(() => window.ebb.douyin.signOut())}>
              <Icon name="logout" className="size-4" /> {t.signOut}
            </Button>
          </div>
        </section>

        <section className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200/80 px-5 py-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" className="h-8 rounded-lg px-1.5 text-zinc-700" disabled={!visibleVideos.length || isTaskActive} onClick={toggleVisible}>
                <span className="checkmark" data-checked={visibleVideos.length > 0 && visibleVideos.every((video) => selectedIds.has(video.id))} />
                {t.selectAll}
              </Button>
              {selectedCount > 0 && <Button variant="ghost" className="h-8 rounded-lg px-2 text-zinc-500" disabled={isTaskActive} onClick={() => setSelectedIds(new Set())}><Icon name="x" className="size-4" /> {t.clear}</Button>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="search-field">
                <Icon name="search" className="size-4" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} />
              </label>
              <label className="flex cursor-pointer items-center gap-2 px-1 text-sm text-zinc-600">
                <input className="sr-only" type="checkbox" checked={selectedOnly} onChange={(event) => setSelectedOnly(event.target.checked)} />
                <span className="switch" data-checked={selectedOnly}><span /></span>
                {t.selectedOnly}
              </label>
            </div>
          </div>

          {visibleVideos.length ? <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-white/95 text-[11px] font-medium tracking-[0.02em] text-zinc-500 backdrop-blur">
                <tr><th className="w-12 px-5 py-3" /><th className="px-3 py-3">{t.title}</th><th className="w-28 px-3 py-3">{t.status}</th></tr>
              </thead>
              <tbody>
                {visibleVideos.map((video) => <tr className="border-t border-zinc-100/90 transition-colors hover:bg-zinc-50/85" key={video.id}>
                  <td className="px-5 py-3"><input aria-label={video.title} className="video-checkbox" type="checkbox" checked={selectedIds.has(video.id)} disabled={isTaskActive || video.status === 'completed'} onChange={() => toggleVideo(video.id)} /></td>
                  <td className="px-3 py-3"><div className="flex min-w-0 items-center gap-3">{video.thumbnail ? <img className="size-10 rounded-lg object-cover" src={video.thumbnail} alt="" /> : <div className="flex size-10 items-center justify-center rounded-lg bg-zinc-100"><Icon name="heart" className="size-4 text-zinc-400" /></div>}<span className="truncate font-medium text-zinc-800">{video.title}</span></div></td>
                  <td className={`px-3 py-3 text-xs font-medium ${statusStyles[video.status]}`}>{video.status === 'processing' && <Icon name="loader" className="mr-1 size-3 animate-spin" />}{statusLabel(video.status)}</td>
                </tr>)}
              </tbody>
            </table>
          </div> : <div className="grid flex-1 place-items-center px-6 py-14 text-center"><div><div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-zinc-100"><Icon name="heart" className="size-5 text-zinc-500" /></div><h2 className="mt-4 text-base font-semibold">{t.emptyTitle}</h2><p className="mt-1 max-w-xs text-sm leading-5 text-zinc-500">{t.emptyBody}</p></div></div>}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200/80 px-5 py-3.5">
            <p className="text-xs text-zinc-500">{snapshot.currentVideoId ? t.taskStates.running : t.privacy}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="h-9 rounded-xl border-zinc-200 bg-white/80 text-zinc-700" disabled={snapshot.state !== 'running' || busy} onClick={() => run(() => window.ebb.douyin.pause())}><Icon name="pause" className="size-4" /> {t.pause}</Button>
              <Button variant="outline" className="h-9 rounded-xl border-zinc-200 bg-white/80 text-zinc-700" disabled={snapshot.state !== 'paused' || !selectedCount || busy} onClick={() => run(() => window.ebb.douyin.resume([...selectedIds]))}><Icon name="play" className="size-4" /> {t.continue}</Button>
              <Button variant="outline" className="h-9 rounded-xl border-zinc-200 bg-white/80 text-zinc-700" disabled={!['running', 'paused'].includes(snapshot.state) || busy} onClick={() => run(() => window.ebb.douyin.stop())}><Icon name="stop" className="size-4" /> {t.stop}</Button>
              <Button variant="destructive" className="h-9 rounded-xl bg-red-600 px-3.5 text-white hover:bg-red-700" disabled={!selectedCount || isTaskActive || busy} onClick={() => setConfirmOpen(true)}><Icon name="heart" className="size-4" /> {t.remove} ({selectedCount})</Button>
            </div>
          </div>
        </section>
      </div>

      {confirmOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-4 backdrop-blur-sm" role="presentation">
        <section aria-modal="true" role="dialog" className="w-full max-w-md rounded-[24px] border border-white/80 bg-white/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.2)]">
          <Icon name="warning" className="size-6 text-red-600" />
          <h2 className="mt-4 text-xl font-semibold tracking-[-0.035em]">{t.confirmTitle}</h2>
          <p className="mt-2 text-sm leading-5 text-zinc-600">{t.confirmBody}</p>
          <div className="mt-6 flex justify-end gap-2"><Button variant="outline" className="rounded-xl border-zinc-200" onClick={() => setConfirmOpen(false)}>{t.cancel}</Button><Button variant="destructive" className="rounded-xl bg-red-600 text-white hover:bg-red-700" onClick={() => { setConfirmOpen(false); void run(() => window.ebb.douyin.start([...selectedIds])) }}>{t.confirm}</Button></div>
        </section>
      </div>}
    </main>
  )
}

export default App
