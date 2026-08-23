import { describe, expect, it, vi } from 'vitest'

import { isSafeTikTokQrCode, isTikTokUrl, registerTikTokNavigationGuards } from './policy.ts'

describe('TikTok workspace policy', () => {
  it('allows only TikTok HTTPS hosts', () => {
    expect(isTikTokUrl('https://www.tiktok.com/login/qrcode')).toBe(true)
    expect(isTikTokUrl('https://m.tiktok.com/')).toBe(true)
    expect(isTikTokUrl('http://www.tiktok.com/')).toBe(false)
    expect(isTikTokUrl('https://tiktok.com.example.invalid/')).toBe(false)
  })

  it('accepts only bounded raster data images for the renderer', () => {
    expect(isSafeTikTokQrCode('data:image/png;base64,aA==')).toBe(true)
    expect(isSafeTikTokQrCode('data:image/svg+xml;base64,aA==')).toBe(false)
    expect(isSafeTikTokQrCode('https://www.tiktok.com/qr.png')).toBe(false)
  })

  it('denies new windows and navigation outside official TikTok HTTPS hosts', () => {
    const handlers = new Map<string, (event: { preventDefault: () => void; url: string }) => void>()
    let openHandler: (() => { action: string }) | undefined
    const webContents = {
      on: (event: string, handler: (event: { preventDefault: () => void; url: string }) => void) => handlers.set(event, handler),
      setWindowOpenHandler: (handler: () => { action: string }) => { openHandler = handler },
    }
    registerTikTokNavigationGuards(webContents as never)

    expect(openHandler?.()).toEqual({ action: 'deny' })
    for (const eventName of ['will-navigate', 'will-frame-navigate']) {
      const preventDefault = vi.fn()
      handlers.get(eventName)?.({ preventDefault, url: 'https://attacker.invalid/callback' })
      expect(preventDefault).toHaveBeenCalledOnce()
    }
  })
})
