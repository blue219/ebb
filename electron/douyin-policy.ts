import type { WebContents } from 'electron'

export const FAVORITES_PAGE_SIZE = 20
export const FAVORITES_LIMIT = 100
export const FAVORITES_PAGE_LIMIT = Math.ceil(FAVORITES_LIMIT / FAVORITES_PAGE_SIZE)

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
