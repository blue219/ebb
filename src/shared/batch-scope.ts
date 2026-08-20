export type BatchScope =
  | { kind: 'all' }
  | { kind: 'limit'; limit: number }
  | { kind: 'manual' }

type SelectableItem = {
  id: string
  status: string
}

export const DEFAULT_BATCH_SCOPE: BatchScope = { kind: 'all' }

export function clampBatchLimit(value: number, totalItems: number) {
  if (totalItems <= 0) return 0
  return Math.min(Math.max(Math.trunc(value), 1), totalItems)
}

export function getBatchTarget(scope: BatchScope, totalItems: number, manualCount: number) {
  if (scope.kind === 'all') return Math.max(0, totalItems)
  if (scope.kind === 'limit') return clampBatchLimit(scope.limit, totalItems)
  return Math.max(0, manualCount)
}

export function getScopeSelectedIds(
  scope: BatchScope,
  items: SelectableItem[],
  manualIds: ReadonlySet<string>,
) {
  const selectableItems = items.filter((item) => item.status !== 'completed')
  if (scope.kind === 'all') return new Set(selectableItems.map((item) => item.id))
  if (scope.kind === 'limit') return new Set(selectableItems.slice(0, scope.limit).map((item) => item.id))
  return new Set(selectableItems.filter((item) => manualIds.has(item.id)).map((item) => item.id))
}

export function transitionToManualSelection(
  scope: BatchScope,
  items: SelectableItem[],
  manualIds: ReadonlySet<string>,
  clickedId: string,
) {
  const next = getScopeSelectedIds(scope, items, manualIds)
  if (next.has(clickedId)) next.delete(clickedId)
  else next.add(clickedId)
  return next
}
