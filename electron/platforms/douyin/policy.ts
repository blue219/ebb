import type { WebContents } from 'electron'

export const FAVORITES_PAGE_SIZE = 30
export const AUTOMATIC_PREFETCH_THRESHOLD = 10
const MAX_QR_CODE_LENGTH = 1_000_000

export const isSafeQrCodeDataUrl = (value: unknown): value is string => (
  typeof value === 'string'
  && value.length <= MAX_QR_CODE_LENGTH
  && /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(value)
)

export const isDouyinUrl = (url: string) => {
  try {
    return new URL(url).hostname.endsWith('.douyin.com')
  } catch {
    return false
  }
}

export const registerDouyinNavigationGuards = (webContents: WebContents) => {
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  webContents.on('will-navigate', (event) => {
    if (!isDouyinUrl(event.url)) event.preventDefault()
  })
  webContents.on('will-frame-navigate', (event) => {
    try {
      if (!['http:', 'https:', 'about:', 'blob:', 'data:'].includes(new URL(event.url).protocol)) {
        event.preventDefault()
      }
    } catch {
      event.preventDefault()
    }
  })
}
