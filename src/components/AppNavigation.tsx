import type { PlatformId } from '../../shared/platforms/contracts'

export type AppPage = PlatformId | 'spacex'

export function AppNavigation({ current, disabled = false, onSelect, comingSoon = 'Coming soon', connectedLabel, className = 'space-y-1.5' }: {
  current: AppPage
  disabled?: boolean
  onSelect: (page: AppPage) => void
  comingSoon?: string
  connectedLabel?: string
  className?: string
}) {
  return <div className={className}>
    {(['douyin', 'tiktok', 'spacex'] as const).map((page) => {
      const name = page === 'douyin' ? 'Douyin' : page === 'tiktok' ? 'TikTok' : 'SpaceX'
      const active = current === page
      return <button key={page} type="button" aria-label={name} aria-pressed={active} disabled={disabled} onClick={() => onSelect(page)} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${active ? 'border border-blue-200/80 bg-blue-50/75 text-blue-700' : 'text-zinc-600 hover:bg-white/70'}`}>
        <span className={`grid size-7 shrink-0 place-items-center rounded-lg text-[10px] font-bold ${active ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-500'}`}>{page === 'spacex' ? '↗' : name.slice(0, 1)}</span>
        <span className="min-w-0 flex-1 font-medium">{name}</span>
        {active && connectedLabel && <span className="flex items-center gap-1 text-[10px] font-medium"><span className="size-1.5 rounded-full bg-blue-500" />{connectedLabel}</span>}
      </button>
    })}
    <div aria-disabled="true" className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-zinc-400">
      <span className="grid size-7 place-items-center rounded-lg bg-zinc-100 text-[10px] font-bold">Y</span>
      <span className="min-w-0 flex-1 font-medium">YouTube</span>
      <span className="text-[10px]">{comingSoon}</span>
    </div>
  </div>
}
