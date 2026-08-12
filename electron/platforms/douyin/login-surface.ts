/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

export async function detectDouyinLoginSurface() {
  const isVisibleSquare = (element: Element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return rect.width >= 100 && rect.width <= 600
      && rect.height >= 100 && rect.height <= 600
      && Math.abs(rect.width - rect.height) <= 24
      && style.display !== 'none'
      && style.visibility !== 'hidden'
  }

  const pageText = document.body?.innerText || ''
  if (/验证码|安全验证|完成验证|captcha|security verification/i.test(pageText)) {
    return { state: 'verification' }
  }
  if (/二维码.{0,12}(?:失效|过期)|QR code.{0,12}expired/i.test(pageText)) {
    const refreshControl = [...document.querySelectorAll('button, [role="button"]')].find((element) => (
      /刷新|Refresh/i.test(element.textContent || '') && !element.hasAttribute('disabled')
    ))
    if (refreshControl instanceof HTMLElement) refreshControl.click()
    return { state: 'loading' }
  }

  const imageSelectors = [
    'img[aria-label*="二维码"]',
    'img[alt*="二维码"]',
    '[class*="qrcode" i] img',
    '[class*="qr-code" i] img',
  ]
  const image = [...document.querySelectorAll<HTMLImageElement>(imageSelectors.join(','))].find(isVisibleSquare)
  if (image) {
    const source = image.currentSrc || image.src
    if (source.startsWith('data:image/')) return { state: 'ready', qrCode: source }
    if (source) {
      try {
        const response = await fetch(source, { credentials: 'include' })
        const blob = await response.blob()
        const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
        if (blob.size > 750_000 || !allowedTypes.includes(blob.type.toLowerCase())) return { state: 'loading' }
        const qrCode = await new Promise<string | ArrayBuffer | null>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(blob)
        })
        return { state: 'ready', qrCode }
      } catch {
        // Continue to canvas and sign-in control fallbacks.
      }
    }
  }

  const canvasSelectors = ['[class*="qrcode" i] canvas', '[class*="qr-code" i] canvas']
  const canvas = [...document.querySelectorAll<HTMLCanvasElement>(canvasSelectors.join(','))].find(isVisibleSquare)
  if (canvas) {
    try {
      return { state: 'ready', qrCode: canvas.toDataURL('image/png') }
    } catch {
      // Continue to the sign-in control fallback.
    }
  }

  // Douyin may render the sign-in trigger as plain text without button semantics.
  const loginControl = [...document.querySelectorAll('button, [role="button"], a, [tabindex], div, span')].find((element) => {
    const text = element.textContent?.trim()
    return (text === '登录' || text === 'Login')
      && element.children.length === 0
      && !element.hasAttribute('disabled')
  })
  if (loginControl instanceof HTMLElement) loginControl.click()
  return { state: 'loading' }
}
