import type { WebContents } from 'electron'

const MAX_QR_CODE_LENGTH = 1_000_000

export const isSafeTikTokQrCode = (value: unknown): value is string => (
  typeof value === 'string'
  && value.length <= MAX_QR_CODE_LENGTH
  && /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(value)
)

export const isTikTokUrl = (url: string) => {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && (parsed.hostname === 'tiktok.com' || parsed.hostname.endsWith('.tiktok.com'))
  } catch {
    return false
  }
}

export const registerTikTokNavigationGuards = (webContents: WebContents) => {
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  webContents.on('will-navigate', (event) => {
    if (!isTikTokUrl(event.url)) event.preventDefault()
  })
  webContents.on('will-frame-navigate', (event) => {
    if (!isTikTokUrl(event.url)) event.preventDefault()
  })
}
