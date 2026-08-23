import { describe, expect, test } from 'vitest'

import { DouyinMutationCoordinator } from './mutation-coordinator.ts'

describe('Douyin mutation coordinator', () => {
  test('keeps one task owner until that owner releases the lock', () => {
    const coordinator = new DouyinMutationCoordinator()

    coordinator.acquire('douyin:likes')
    expect(coordinator.currentOwner()).toBe('douyin:likes')
    expect(() => coordinator.acquire('douyin:following')).toThrow(/liked-video task is active/i)

    coordinator.release('douyin:following')
    expect(coordinator.currentOwner()).toBe('douyin:likes')

    coordinator.release('douyin:likes')
    coordinator.acquire('douyin:following')
    expect(coordinator.currentOwner()).toBe('douyin:following')
    expect(() => coordinator.acquire('douyin:collections')).toThrow(/following-account task is active/i)
  })

  test('lets a task reacquire its retained lock while paused', () => {
    const coordinator = new DouyinMutationCoordinator()
    coordinator.acquire('douyin:following')
    expect(() => coordinator.acquire('douyin:following')).not.toThrow()
  })

  test('identifies a collection task while it holds the shared mutation lock', () => {
    const coordinator = new DouyinMutationCoordinator()
    coordinator.acquire('douyin:collections')
    expect(() => coordinator.acquire('douyin:likes')).toThrow(/collection-video task is active/i)
  })
})
