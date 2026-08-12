export type AutomaticRemovalMode = 'all' | 'limited'

export interface AutomaticRemovalPlan {
  mode: AutomaticRemovalMode
  total: number
}

export function createAutomaticRemovalPlan(
  limit: number | undefined,
  accountLikes: number | undefined,
  loadedPending: number,
): AutomaticRemovalPlan {
  // The signed-in account total is authoritative; loaded rows are only a fallback when it is unavailable.
  const availableLikes = Math.max(0, accountLikes ?? loadedPending)
  if (limit === undefined) return { mode: 'all', total: availableLikes }
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('The removal limit must be a positive integer.')
  if (limit > availableLikes) throw new Error(`The removal limit cannot exceed the account's ${availableLikes} likes.`)
  return { mode: 'limited', total: limit }
}

export function hasReachedAutomaticTarget(mode: AutomaticRemovalMode, completed: number, total: number) {
  return mode === 'limited' && completed >= total
}

export function remainingAutomaticTarget(mode: AutomaticRemovalMode, completed: number, total: number) {
  return mode === 'limited' ? Math.max(0, total - completed) : Number.POSITIVE_INFINITY
}
