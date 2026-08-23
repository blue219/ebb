import { memo } from 'react'

import type { VideoStatus } from '../../../shared/platforms/douyin/contracts'
import { Icon } from './icons'

type Props = {
  id: string
  title: string
  thumbnail?: string
  status: VideoStatus
  selected: boolean
  taskLocked: boolean
  onToggle: (id: string) => void
  onDismiss: (id: string) => void
}

// Status snapshots arrive after each removal; memoization keeps unchanged rows out of that hot render path.
export const VideoRow = memo(function VideoRow({
  id,
  title,
  thumbnail,
  status,
  selected,
  taskLocked,
  onToggle,
  onDismiss,
}: Props) {
  return <label className={`video-cover ${selected ? 'is-selected' : ''} ${status === 'completed' ? 'video-row-removing' : ''}`} onAnimationEnd={() => status === 'completed' && onDismiss(id)}>
    {thumbnail
      ? <img className="absolute inset-0 size-full object-cover" src={thumbnail} alt="" loading="lazy" decoding="async" />
      : <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-zinc-100 to-zinc-200"><Icon name="heart" className="size-6 text-zinc-400" /></div>}
    <span className="absolute inset-0 bg-gradient-to-t from-zinc-950/20 via-transparent to-zinc-950/10" aria-hidden="true" />
    <input aria-label={title} className="video-cover-checkbox" type="checkbox" checked={selected} disabled={taskLocked || status === 'completed'} onChange={() => onToggle(id)} />
    {status === 'processing' && <span className="absolute right-2 bottom-2 grid size-7 place-items-center rounded-full bg-white/88 text-zinc-700 shadow-sm" aria-label="Processing"><Icon name="loader" className="size-4 animate-spin" /></span>}
    {status === 'failed' && <span className="absolute right-2 bottom-2 grid size-7 place-items-center rounded-full bg-red-600 text-white shadow-sm" aria-label="Paused"><Icon name="warning" className="size-4" /></span>}
  </label>
})
