import assert from 'node:assert/strict'
import test from 'node:test'

import type { WebContents } from 'electron'

import {
  FAVORITES_PAGE_SIZE,
  isSafeQrCodeDataUrl,
  registerDouyinNavigationGuards,
} from './douyin-policy.ts'

type NavigationEvent = {
  preventDefault: () => void
  url: string
}

const createWebContents = () => {
  const listeners = new Map<string, (event: NavigationEvent) => void>()
  const webContents = {
    on(event: string, listener: (navigationEvent: NavigationEvent) => void) {
      listeners.set(event, listener)
      return this
    },
    setWindowOpenHandler() {},
  } as unknown as WebContents
  return { listeners, webContents }
}

test('blocks custom protocols from subframes', () => {
  const { listeners, webContents } = createWebContents()
  registerDouyinNavigationGuards(webContents)

  const listener = listeners.get('will-frame-navigate')
  assert.ok(listener, 'will-frame-navigate must be guarded')

  let prevented = false
  listener({
    preventDefault: () => { prevented = true },
    url: 'bytedance://launch/app',
  })
  assert.equal(prevented, true)
})

test('allows HTTPS navigation inside subframes', () => {
  const { listeners, webContents } = createWebContents()
  registerDouyinNavigationGuards(webContents)

  const listener = listeners.get('will-frame-navigate')
  assert.ok(listener)

  let prevented = false
  listener({
    preventDefault: () => { prevented = true },
    url: 'https://lf-rc1.yhgfb-cn-static.com/verification',
  })
  assert.equal(prevented, false)
})

test('loads liked videos in pages of 10', () => {
  assert.equal(FAVORITES_PAGE_SIZE, 10)
})

test('accepts only bounded raster QR code data URLs', () => {
  assert.equal(isSafeQrCodeDataUrl('data:image/png;base64,iVBORw0KGgo='), true)
  assert.equal(isSafeQrCodeDataUrl('data:image/webp;base64,UklGRg=='), true)
  assert.equal(isSafeQrCodeDataUrl('data:image/svg+xml;base64,PHN2Zz4='), false)
  assert.equal(isSafeQrCodeDataUrl('https://www.douyin.com/qr.png'), false)
  assert.equal(isSafeQrCodeDataUrl(`data:image/png;base64,${'a'.repeat(1_000_000)}`), false)
})
