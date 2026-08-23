import { describe, expect, it } from 'vitest'

import { PlatformMutationCoordinator } from './mutation-coordinator.ts'

describe('application-wide mutation coordination', () => {
  it('prevents a second platform from starting while a paused task retains ownership', () => {
    const coordinator = new PlatformMutationCoordinator()

    coordinator.acquire('douyin:likes')

    expect(() => coordinator.acquire('tiktok:following')).toThrow(
      'A Douyin liked-video task is active. Complete or stop it before starting another task.',
    )
    expect(coordinator.currentOwner()).toBe('douyin:likes')
  })

  it('allows another platform after the owner releases the lock', () => {
    const coordinator = new PlatformMutationCoordinator()
    coordinator.acquire('douyin:collections')
    coordinator.release('douyin:collections')

    expect(() => coordinator.acquire('tiktok:likes')).not.toThrow()
    expect(coordinator.currentOwner()).toBe('tiktok:likes')
  })
})
