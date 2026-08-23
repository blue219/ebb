export type AutomaticRemovalMode = 'all' | 'limited'

export interface AutomaticRemovalPlan {
  mode: AutomaticRemovalMode
  total: number | null
}

export function createAutomaticRemovalPlan(
  limit: number | undefined,
  accountItemCount: number | undefined,
  _loadedPending: number,
  itemLabel = 'likes',
): AutomaticRemovalPlan {
  if (limit === undefined) return { mode: 'all', total: accountItemCount === undefined ? null : Math.max(0, accountItemCount) }
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('The removal limit must be a positive integer.')
  if (accountItemCount !== undefined && limit > Math.max(0, accountItemCount)) {
    throw new Error(`The removal limit cannot exceed the account's ${Math.max(0, accountItemCount)} ${itemLabel}.`)
  }
  return { mode: 'limited', total: limit }
}

export function hasReachedAutomaticTarget(mode: AutomaticRemovalMode, completed: number, total: number | null) {
  return mode === 'limited' && total !== null && completed >= total
}

export function remainingAutomaticTarget(mode: AutomaticRemovalMode, completed: number, total: number | null) {
  return mode === 'limited' && total !== null ? Math.max(0, total - completed) : Number.POSITIVE_INFINITY
}
