import type { PlatformId } from '../../../shared/platforms/contracts.js'

export type PlatformMutationKind = 'likes' | 'following' | 'collections'
export type PlatformMutationOwner = `${PlatformId}:${PlatformMutationKind}`

const taskLabels: Record<PlatformMutationKind, string> = {
  likes: 'liked-video',
  following: 'following-account',
  collections: 'collection-video',
}

export class PlatformMutationCoordinator {
  private owner?: PlatformMutationOwner

  acquire(owner: PlatformMutationOwner) {
    if (this.owner && this.owner !== owner) {
      const [platform, kind] = this.owner.split(':') as [PlatformId, PlatformMutationKind]
      const platformName = platform === 'douyin' ? 'Douyin' : 'TikTok'
      throw new Error(`A ${platformName} ${taskLabels[kind]} task is active. Complete or stop it before starting another task.`)
    }
    this.owner = owner
  }

  release(owner: PlatformMutationOwner) {
    if (this.owner === owner) this.owner = undefined
  }

  currentOwner() {
    return this.owner
  }
}
