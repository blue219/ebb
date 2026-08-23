import { describe, expect, test } from 'vitest'

import { DouyinMutationCoordinator } from './mutation-coordinator.ts'

describe('Douyin mutation coordinator', () => {
  test('keeps one task owner until that owner releases the lock', () => {
    const coordinator = new DouyinMutationCoordinator()

    coordinator.acquire('likes')
    expect(coordinator.currentOwner()).toBe('likes')
    expect(() => coordinator.acquire('following')).toThrow(/liked-video task is active/i)

    coordinator.release('following')
    expect(coordinator.currentOwner()).toBe('likes')

    coordinator.release('likes')
    coordinator.acquire('following')
    expect(coordinator.currentOwner()).toBe('following')
    expect(() => coordinator.acquire('collections')).toThrow(/following-account task is active/i)
  })

  test('lets a task reacquire its retained lock while paused', () => {
    const coordinator = new DouyinMutationCoordinator()
    coordinator.acquire('following')
    expect(() => coordinator.acquire('following')).not.toThrow()
  })

  test('identifies a collection task while it holds the shared mutation lock', () => {
    const coordinator = new DouyinMutationCoordinator()
    coordinator.acquire('collections')
    expect(() => coordinator.acquire('likes')).toThrow(/collection-video task is active/i)
  })
})
