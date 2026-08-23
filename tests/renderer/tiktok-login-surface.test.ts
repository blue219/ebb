// @vitest-environment jsdom

import { beforeEach, expect, test, vi } from 'vitest'

import { detectTikTokLoginSurface } from '../../electron/platforms/tiktok/login-surface'

const makeVisibleSquare = (element: Element) => {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    width: 240, height: 240, x: 0, y: 0, top: 0, right: 240, bottom: 240, left: 0, toJSON: () => ({}),
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
  Object.defineProperty(document.body, 'innerText', { configurable: true, value: '' })
})

test('returns the visible TikTok QR image without clicking page controls', async () => {
  document.body.innerHTML = '<div data-e2e="qr-code"><img src="data:image/png;base64,aA=="></div><button>Log in</button>'
  makeVisibleSquare(document.querySelector('img')!)
  const click = vi.spyOn(document.querySelector('button')!, 'click')

  await expect(detectTikTokLoginSurface()).resolves.toEqual({ state: 'ready', qrCode: 'data:image/png;base64,aA==' })
  expect(click).not.toHaveBeenCalled()
})

test('reports TikTok verification instead of trying to bypass it', async () => {
  Object.defineProperty(document.body, 'innerText', { configurable: true, value: 'Complete verification to continue' })
  await expect(detectTikTokLoginSurface()).resolves.toEqual({ state: 'verification' })
})
