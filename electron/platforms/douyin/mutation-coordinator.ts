export type DouyinMutationOwner = 'likes' | 'following'

export class DouyinMutationCoordinator {
  private owner?: DouyinMutationOwner

  acquire(owner: DouyinMutationOwner) {
    if (this.owner && this.owner !== owner) {
      const activeTask = this.owner === 'likes' ? 'liked-video' : 'following-account'
      throw new Error(`A ${activeTask} task is active. Complete or stop it before starting another task.`)
    }
    this.owner = owner
  }

  release(owner: DouyinMutationOwner) {
    if (this.owner === owner) this.owner = undefined
  }

  currentOwner() {
    return this.owner
  }
}
