import { createPlatformIpcChannels } from '../contracts.js'

export {
  type AccountSnapshot,
  type AccountState,
  type CollectionBridge,
  type FollowingAccount,
  type FollowingBridge,
  type FollowingRelation,
  type FollowingTaskSnapshot,
  type ItemStatus as FollowingAccountStatus,
  type ItemStatus as VideoStatus,
  type LoginSnapshot,
  type LoginState,
  type PlatformBridge as DouyinBridge,
  type PlatformStateSnapshot as DouyinStateSnapshot,
  type TaskCounts,
  type TaskMode,
  type TaskSnapshot,
  type TaskState,
  type VideoItem as DouyinVideo,
} from '../contracts.js'

export const DOUYIN_IPC_CHANNELS = createPlatformIpcChannels('douyin')
