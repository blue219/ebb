import type { PlatformBridge } from '../shared/platforms/contracts'

declare global {
  interface Window {
    ebb: {
      platform: string
      douyin: PlatformBridge
      tiktok: PlatformBridge
    }
  }
}

export {}
