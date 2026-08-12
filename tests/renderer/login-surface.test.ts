// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { detectDouyinLoginSurface } from '../../electron/platforms/douyin/login-surface'

const makeVisibleSquare = (element: Element) => {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    width: 240,
    height: 240,
    x: 0,
    y: 0,
    top: 0,
    right: 240,
    bottom: 240,
    left: 0,
    toJSON: () => ({}),
  })
}

describe('Douyin login surface detection', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    Object.defineProperty(document.body, 'innerText', { configurable: true, value: '' })
  })
  afterEach(() => vi.unstubAllGlobals())

  test('returns a visible bounded data-image QR code', async () => {
    document.body.innerHTML = '<img aria-label="二维码" src="data:image/png;base64,aA==">'
    const image = document.querySelector('img')!
    makeVisibleSquare(image)

    await expect(detectDouyinLoginSurface()).resolves.toEqual({
      state: 'ready',
      qrCode: 'data:image/png;base64,aA==',
    })
  })

  test('reports verification before attempting sign-in controls', async () => {
    Object.defineProperty(document.body, 'innerText', { configurable: true, value: '请完成安全验证' })
    await expect(detectDouyinLoginSurface()).resolves.toEqual({ state: 'verification' })
  })

  test('converts a supported remote QR image into a data URL', async () => {
    document.body.innerHTML = '<div class="qrcode"><img src="https://example.test/qr.png"></div>'
    makeVisibleSquare(document.querySelector('img')!)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      blob: async () => new Blob(['qr'], { type: 'image/png' }),
    }))

    const result = await detectDouyinLoginSurface()
    expect(result).toMatchObject({ state: 'ready', qrCode: expect.stringMatching(/^data:image\/png;base64,/) })
  })

  test('uses a visible QR canvas when an image cannot be read', async () => {
    document.body.innerHTML = '<div class="qrcode"><img src="https://example.test/qr.png"><canvas></canvas></div>'
    makeVisibleSquare(document.querySelector('img')!)
    const canvas = document.querySelector('canvas')!
    makeVisibleSquare(canvas)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,Y2FudmFz')

    await expect(detectDouyinLoginSurface()).resolves.toEqual({
      state: 'ready',
      qrCode: 'data:image/png;base64,Y2FudmFz',
    })
  })

  test('refreshes an expired QR code and opens a plain login control', async () => {
    document.body.innerHTML = '<button>刷新</button>'
    Object.defineProperty(document.body, 'innerText', { configurable: true, value: '二维码已过期' })
    const refresh = vi.spyOn(document.querySelector('button')!, 'click')
    await expect(detectDouyinLoginSurface()).resolves.toEqual({ state: 'loading' })
    expect(refresh).toHaveBeenCalledOnce()

    document.body.innerHTML = '<div>Login</div>'
    Object.defineProperty(document.body, 'innerText', { configurable: true, value: '' })
    const login = vi.spyOn(document.querySelector('div')!, 'click')
    await expect(detectDouyinLoginSurface()).resolves.toEqual({ state: 'loading' })
    expect(login).toHaveBeenCalledOnce()
  })
})
