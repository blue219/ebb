import type { PlatformBridge } from '../shared/platforms/contracts'
import type { SpaceXBridge } from '../shared/spacex'

declare global {
  interface Window {
    ebb: {
      platform: string
      douyin: PlatformBridge
      tiktok: PlatformBridge
      spacex: SpaceXBridge
    }
  }
}

export {}
