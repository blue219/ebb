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

  test('does not confuse the SMS-login tab with a security verification', async () => {
    document.body.innerHTML = '<img src="data:image/png;base64,aA==">'
    Object.defineProperty(document.body, 'innerText', { configurable: true, value: '扫码登录\n验证码登录' })
    makeVisibleSquare(document.querySelector('img')!)

    await expect(detectDouyinLoginSurface()).resolves.toEqual({
      state: 'ready',
      qrCode: 'data:image/png;base64,aA==',
    })
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

  test('uses a visible canvas without a QR-specific class', async () => {
    document.body.innerHTML = '<canvas></canvas>'
    const canvas = document.querySelector('canvas')!
    makeVisibleSquare(canvas)
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,Y2FudmFz')

    await expect(detectDouyinLoginSurface()).resolves.toEqual({
      state: 'ready',
      qrCode: 'data:image/png;base64,Y2FudmFz',
    })
  })

  test("reads a QR image from Douyin's current QR-code container", async () => {
    document.body.innerHTML = '<div id="animate_qrcode_container"><img src="data:image/png;base64,AAAA"></div>'
    makeVisibleSquare(document.querySelector('img')!)

    await expect(detectDouyinLoginSurface()).resolves.toEqual({
      state: 'ready',
      qrCode: 'data:image/png;base64,AAAA',
    })
  })

  test('reads an unlabelled embedded QR image from the current login page', async () => {
    document.body.innerHTML = '<div><img src="data:image/png;base64,AAAA"></div>'
    Object.defineProperty(document.body, 'innerText', { configurable: true, value: '扫码登录' })
    makeVisibleSquare(document.querySelector('img')!)

    await expect(detectDouyinLoginSurface()).resolves.toEqual({
      state: 'ready',
      qrCode: 'data:image/png;base64,AAAA',
    })
  })

  test('opens the QR-login tab instead of submitting the phone-login control', async () => {
    document.body.innerHTML = '<div id="qr-tab">扫码登录</div><div id="phone-login">登录</div>'
    const qrTab = document.querySelector<HTMLElement>('#qr-tab')!
    const phoneLogin = document.querySelector<HTMLElement>('#phone-login')!
    makeVisibleSquare(qrTab)
    makeVisibleSquare(phoneLogin)
    const openQrTab = vi.spyOn(qrTab, 'click')
    const submitPhoneLogin = vi.spyOn(phoneLogin, 'click')

    await expect(detectDouyinLoginSurface()).resolves.toEqual({ state: 'loading' })
    expect(openQrTab).toHaveBeenCalledOnce()
    expect(submitPhoneLogin).not.toHaveBeenCalled()
  })

  test('refreshes an expired QR code and opens a plain login control', async () => {
    document.body.innerHTML = '<button>刷新</button>'
    Object.defineProperty(document.body, 'innerText', { configurable: true, value: '二维码已过期' })
    const refresh = vi.spyOn(document.querySelector('button')!, 'click')
    await expect(detectDouyinLoginSurface()).resolves.toEqual({ state: 'loading' })
    expect(refresh).toHaveBeenCalledOnce()

    document.body.innerHTML = '<div>Login</div>'
    Object.defineProperty(document.body, 'innerText', { configurable: true, value: '' })
    const loginControl = document.querySelector('div')!
    makeVisibleSquare(loginControl)
    const login = vi.spyOn(loginControl, 'click')
    await expect(detectDouyinLoginSurface()).resolves.toEqual({ state: 'loading' })
    expect(login).toHaveBeenCalledOnce()
  })

  test('opens a visible sign-in control when its label is nested', async () => {
    document.body.innerHTML = '<button><span>登录</span></button>'
    const login = vi.spyOn(document.querySelector('button')!, 'click')
    makeVisibleSquare(document.querySelector('button')!)

    await expect(detectDouyinLoginSurface()).resolves.toEqual({ state: 'loading' })
    expect(login).toHaveBeenCalledOnce()
  })

  test('opens the account area when it is the only sign-in entry', async () => {
    document.body.innerHTML = '<a>我的</a>'
    const accountControl = document.querySelector('a')!
    makeVisibleSquare(accountControl)
    const openAccount = vi.spyOn(accountControl, 'click')

    await expect(detectDouyinLoginSurface()).resolves.toEqual({ state: 'loading' })
    expect(openAccount).toHaveBeenCalledOnce()
  })
})
