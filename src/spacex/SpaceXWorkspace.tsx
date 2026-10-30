import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, RefreshCw, Search } from 'lucide-react'

import { AppNavigation, type AppPage } from '@/components/AppNavigation'
import { Button } from '@/components/ui/button'
import { EMPTY_FILTERS, loadMissions, selectMissions, type Filters, type MissionSnapshot, type Sort, type SortKey } from './data'

const columns: { key: SortKey; label: string }[] = [
  { key: 'title', label: '任务' },
  { key: 'vehicle', label: '火箭' },
  { key: 'launchSite', label: '发射场' },
  { key: 'returnSite', label: '回收地点' },
  { key: 'launchDate', label: '发射日期' },
]
const filterColumns = columns.filter((column) => ['vehicle', 'launchSite', 'returnSite'].includes(column.key))
const controlClass = 'h-10 min-w-0 rounded-xl border border-zinc-200/80 bg-white/75 px-3 text-sm text-zinc-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-400'

export default function SpaceXWorkspace({ onSelectPage }: { onSelectPage: (page: AppPage) => void }) {
  const [snapshot, setSnapshot] = useState<MissionSnapshot>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [sort, setSort] = useState<Sort>({ key: 'launchDate', direction: 'desc' })
  const pending = useRef<AbortController | null>(null)

  const load = useCallback(async (force = false) => {
    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    setLoading(true)
    setError('')
    try {
      const result = await loadMissions({ force, signal: controller.signal })
      if (!controller.signal.aborted) setSnapshot(result)
    } catch {
      if (!controller.signal.aborted) setError('无法获取 SpaceX 数据，请重试。')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => pending.current?.abort()
  }, [load])

  const visible = useMemo(() => selectMissions(snapshot?.missions ?? [], filters, sort), [snapshot, filters, sort])
  const options = useMemo(() => Object.fromEntries(filterColumns.map(({ key }) => [key,
    [...new Set(snapshot?.missions.map((mission) => mission[key]).filter(Boolean) ?? [])].sort(),
  ])) as Record<string, string[]>, [snapshot])

  const updateFilter = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }))
  const toggleSort = (key: SortKey) => setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))
  const openMission = async (slug: string) => {
    try {
      await window.ebb.spacex.openMission(slug)
    } catch {
      setError('无法打开任务详情，请重试。')
    }
  }

  return <main className="h-svh overflow-hidden bg-[#f4f6fa] p-0 text-zinc-950 sm:p-2">
    <div className="app-shell mx-auto flex h-full w-full max-w-[1560px] flex-col overflow-hidden border border-white/90 bg-white/70 shadow-[0_18px_65px_rgba(0,0,0,0.08)] backdrop-blur-2xl sm:rounded-[28px] md:flex-row">
      <aside className="workspace-sidebar" aria-label="应用导航">
        <h1 className="text-[2rem] leading-none font-semibold tracking-[-0.065em]">Ebb</h1>
        <nav className="mt-4 md:mt-7" aria-label="工作区"><AppNavigation current="spacex" onSelect={onSelectPage} comingSoon="即将推出" className="grid grid-cols-2 gap-1 md:block md:space-y-1.5" /></nav>
      </aside>
      <section className="workspace-content min-w-0" aria-labelledby="spacex-title">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-200/70 px-4 py-5 sm:px-6">
          <div>
            <p className="text-[11px] font-medium tracking-[0.16em] text-zinc-400 uppercase">SpaceX</p>
            <h2 id="spacex-title" className="mt-1 text-2xl font-semibold tracking-tight">已完成任务</h2>
          </div>
          <Button variant="outline" className="rounded-xl bg-white/65" disabled={loading} onClick={() => void load(true)}>
            <RefreshCw className={`size-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} />{loading ? '加载中' : '刷新'}
          </Button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
          <div className="glass-panel flex shrink-0 flex-col gap-3 p-4">
            <label className="relative flex min-w-0 items-center">
              <Search aria-hidden="true" className="absolute left-3 size-4 text-zinc-400" />
              <input aria-label="搜索任务名称" placeholder="搜索任务名称" className={`${controlClass} w-full pl-9`} value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} />
            </label>
            <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 xl:grid-cols-3">
              {filterColumns.map(({ key, label }) => <label key={key} className="flex min-w-0 flex-col gap-1.5 text-xs text-zinc-500">{label}
                <select className={controlClass} value={filters[key as keyof Filters]} onChange={(event) => updateFilter(key as keyof Filters, event.target.value)}>
                  <option value="">全部</option>
                  {options[key].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>)}
              <label className="flex min-w-0 flex-col gap-1.5 text-xs text-zinc-500">开始日期
                <input type="date" className={controlClass} value={filters.from} max={filters.to || undefined} onChange={(event) => updateFilter('from', event.target.value)} />
              </label>
              <label className="flex min-w-0 flex-col gap-1.5 text-xs text-zinc-500">结束日期
                <input type="date" className={controlClass} value={filters.to} min={filters.from || undefined} onChange={(event) => updateFilter('to', event.target.value)} />
              </label>
              <Button variant="outline" className="h-10 self-end rounded-xl bg-white/65" onClick={() => { setFilters(EMPTY_FILTERS); setSort({ key: 'launchDate', direction: 'desc' }) }}>重置</Button>
            </div>
          </div>
          {error && <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">
            <span>{error}</span><Button variant="outline" disabled={loading} onClick={() => void load(true)}>重试</Button>
          </div>}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-1 text-xs text-zinc-500" aria-live="polite">
            <span>{visible.length} / {snapshot?.missions.length ?? 0} 个任务</span>
            {snapshot && <time dateTime={new Date(snapshot.fetchedAt).toISOString()}>更新于 {new Date(snapshot.fetchedAt).toLocaleString('zh-CN', { hour12: false })}</time>}
          </div>
          <div className="table-surface min-h-48 flex-1 overflow-auto" aria-busy={loading}>
            <table className="w-full min-w-[850px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[#f4f6fa]/95 backdrop-blur-xl">
                <tr>{columns.map(({ key, label }) => <th key={key} scope="col" aria-sort={sort.key === key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'} className="border-b border-zinc-200/80 px-4 py-3 font-medium text-zinc-500">
                  <button type="button" className="flex items-center gap-2 whitespace-nowrap rounded-sm focus-visible:outline-2 focus-visible:outline-blue-400" onClick={() => toggleSort(key)}>{label}
                    {sort.key === key ? sort.direction === 'asc' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" /> : <ArrowUpDown className="size-3.5 opacity-50" />}
                  </button>
                </th>)}<th scope="col" className="px-4 py-3 font-medium text-zinc-500">详情</th></tr>
              </thead>
              <tbody>
                {visible.map((mission) => <tr key={mission.id} className="border-b border-zinc-200/65 transition-colors hover:bg-white/80">
                  <td className="px-4 py-4 font-medium">{mission.title}</td>
                  <td className="px-4 py-4 whitespace-nowrap">{mission.vehicle || '—'}</td>
                  <td className="px-4 py-4">{mission.launchSite || '—'}</td>
                  <td className="px-4 py-4">{mission.returnSite || '—'}</td>
                  <td className="px-4 py-4 whitespace-nowrap tabular-nums">{mission.launchDate}</td>
                  <td className="px-4 py-4"><button type="button" aria-label={`查看 ${mission.title} ${mission.launchDate} 详情`} onClick={() => void openMission(mission.slug)} className="flex items-center gap-1 whitespace-nowrap rounded-sm text-blue-600 hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-400">详情<ExternalLink className="size-3.5" /></button></td>
                </tr>)}
                {!visible.length && <tr><td colSpan={6} className="px-4 py-12 text-center text-zinc-500">{loading ? '正在加载任务…' : error && !snapshot ? '任务加载失败' : '没有符合条件的任务'}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  </main>
}
