import assert from 'node:assert/strict'
import test from 'node:test'

import type { WebContents } from 'electron'

import {
  FAVORITES_LIMIT,
  FAVORITES_PAGE_LIMIT,
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

test('limits a scan to the first 100 liked videos', () => {
  assert.equal(FAVORITES_LIMIT, 100)
  assert.equal(FAVORITES_PAGE_LIMIT, 5)
})
