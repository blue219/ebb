export type AutomaticRemovalMode = 'all' | 'limited'

export interface AutomaticRemovalPlan {
  mode: AutomaticRemovalMode
  total: number
}

export function createAutomaticRemovalPlan(
  limit: number | undefined,
  accountItemCount: number | undefined,
  loadedPending: number,
  itemLabel = 'likes',
): AutomaticRemovalPlan {
  // The signed-in account total is authoritative; loaded rows are only a fallback when it is unavailable.
  const availableItems = Math.max(0, accountItemCount ?? loadedPending)
  if (limit === undefined) return { mode: 'all', total: availableItems }
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('The removal limit must be a positive integer.')
  if (limit > availableItems) throw new Error(`The removal limit cannot exceed the account's ${availableItems} ${itemLabel}.`)
  return { mode: 'limited', total: limit }
}

export function hasReachedAutomaticTarget(mode: AutomaticRemovalMode, completed: number, total: number) {
  return mode === 'limited' && completed >= total
}

export function remainingAutomaticTarget(mode: AutomaticRemovalMode, completed: number, total: number) {
  return mode === 'limited' ? Math.max(0, total - completed) : Number.POSITIVE_INFINITY
}
