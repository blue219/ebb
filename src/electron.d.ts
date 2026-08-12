import type { DouyinBridge } from '../shared/platforms/douyin/contracts'

declare global {
  interface Window {
    ebb: {
      platform: string
      douyin: DouyinBridge
    }
  }
}

export {}
