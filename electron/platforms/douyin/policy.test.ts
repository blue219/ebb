import { expect, test } from 'vitest'

import type { WebContents } from 'electron'

import {
  FAVORITES_PAGE_SIZE,
  AUTOMATIC_PREFETCH_THRESHOLD,
  isSafeQrCodeDataUrl,
  registerDouyinNavigationGuards,
} from './policy.ts'

type NavigationEvent = {
  preventDefault: () => void
  url: string
}

const createWebContents = () => {
  const listeners = new Map<string, (event: NavigationEvent) => void>()
  let windowOpenHandler = () => ({ action: 'allow' })
  const webContents = {
    on(event: string, listener: (navigationEvent: NavigationEvent) => void) {
      listeners.set(event, listener)
      return this
    },
    setWindowOpenHandler(handler: () => { action: string }) { windowOpenHandler = handler },
  } as unknown as WebContents
  return { listeners, webContents, windowOpenHandler: () => windowOpenHandler() }
}

test('allows only Douyin top-level navigation and denies new windows', () => {
  const { listeners, webContents, windowOpenHandler } = createWebContents()
  registerDouyinNavigationGuards(webContents)

  expect(windowOpenHandler()).toEqual({ action: 'deny' })
  const listener = listeners.get('will-navigate')
  expect(listener).toBeDefined()
  let prevented = false
  listener?.({ preventDefault: () => { prevented = true }, url: 'https://www.douyin.com/user/self' })
  expect(prevented).toBe(false)
  listener?.({ preventDefault: () => { prevented = true }, url: 'https://douyin.com.evil.test/' })
  expect(prevented).toBe(true)
})

test('blocks custom protocols from subframes', () => {
  const { listeners, webContents } = createWebContents()
  registerDouyinNavigationGuards(webContents)

  const listener = listeners.get('will-frame-navigate')
  expect(listener, 'will-frame-navigate must be guarded').toBeDefined()

  let prevented = false
  listener({
    preventDefault: () => { prevented = true },
    url: 'bytedance://launch/app',
  })
  expect(prevented).toBe(true)
})

test('allows HTTPS navigation inside subframes', () => {
  const { listeners, webContents } = createWebContents()
  registerDouyinNavigationGuards(webContents)

  const listener = listeners.get('will-frame-navigate')
  expect(listener).toBeDefined()

  let prevented = false
  listener({
    preventDefault: () => { prevented = true },
    url: 'https://lf-rc1.yhgfb-cn-static.com/verification',
  })
  expect(prevented).toBe(false)
})

test('blocks malformed subframe navigation', () => {
  const { listeners, webContents } = createWebContents()
  registerDouyinNavigationGuards(webContents)
  let prevented = false
  listeners.get('will-frame-navigate')?.({ preventDefault: () => { prevented = true }, url: 'not a url' })
  expect(prevented).toBe(true)
})

test('loads liked videos in pages of 30 and prefetches at 10 rows', () => {
  expect(FAVORITES_PAGE_SIZE).toBe(30)
  expect(AUTOMATIC_PREFETCH_THRESHOLD).toBe(10)
})

test('accepts only bounded raster QR code data URLs', () => {
  expect(isSafeQrCodeDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
  expect(isSafeQrCodeDataUrl('data:image/webp;base64,UklGRg==')).toBe(true)
  expect(isSafeQrCodeDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false)
  expect(isSafeQrCodeDataUrl('https://www.douyin.com/qr.png')).toBe(false)
  expect(isSafeQrCodeDataUrl(`data:image/png;base64,${'a'.repeat(1_000_000)}`)).toBe(false)
})
