export type ClearScope =
  | { kind: 'all' }
  | { kind: 'limit'; limit: number }
  | { kind: 'manual' }

type SelectableVideo = {
  id: string
  status: string
}

export const DEFAULT_CLEAR_SCOPE: ClearScope = { kind: 'all' }

export function clampClearLimit(value: number, totalLikes: number) {
  if (totalLikes <= 0) return 0
  return Math.min(Math.max(Math.trunc(value), 1), totalLikes)
}

export function getClearTarget(scope: ClearScope, totalLikes: number, manualCount: number) {
  if (scope.kind === 'all') return Math.max(0, totalLikes)
  if (scope.kind === 'limit') return clampClearLimit(scope.limit, totalLikes)
  return Math.max(0, manualCount)
}

export function getScopeSelectedIds(
  scope: ClearScope,
  videos: SelectableVideo[],
  manualIds: ReadonlySet<string>,
) {
  const selectableVideos = videos.filter((video) => video.status !== 'completed')
  if (scope.kind === 'all') return new Set(selectableVideos.map((video) => video.id))
  if (scope.kind === 'limit') return new Set(selectableVideos.slice(0, scope.limit).map((video) => video.id))
  return new Set(selectableVideos.filter((video) => manualIds.has(video.id)).map((video) => video.id))
}

export function transitionToManualSelection(
  scope: ClearScope,
  videos: SelectableVideo[],
  manualIds: ReadonlySet<string>,
  clickedId: string,
) {
  const next = getScopeSelectedIds(scope, videos, manualIds)
  if (next.has(clickedId)) next.delete(clickedId)
  else next.add(clickedId)
  return next
}
