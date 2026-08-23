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

  const isVisible = (element: Element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return rect.width > 0 && rect.height > 0
      && style.display !== 'none'
      && style.visibility !== 'hidden'
  }

  const pageText = document.body?.innerText || ''
  const hasQrLoginPrompt = /扫码登录|scan(?:\s+the)?\s+qr\s+code/i.test(pageText)
  if (/安全验证|完成验证|拖动滑块|captcha|security verification/i.test(pageText)) {
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
    '[id*="qrcode" i] img',
    '[id*="qr-code" i] img',
  ]
  const image = [...document.querySelectorAll<HTMLImageElement>('img')].find((candidate) => {
    if (!isVisibleSquare(candidate)) return false
    const source = candidate.currentSrc || candidate.src
    const container = candidate.closest('[id], [class]')
    const hint = `${candidate.getAttribute('aria-label') || ''} ${candidate.alt} ${candidate.className} ${container?.id || ''} ${container?.className || ''} ${source}`
    return candidate.matches(imageSelectors.join(','))
      || /qrcode|qr-code|二维码/i.test(hint)
      // The current official login page embeds an unlabelled data-image next to its QR-login prompt.
      || (hasQrLoginPrompt && source.startsWith('data:image/'))
  })
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

  const canvas = [...document.querySelectorAll<HTMLCanvasElement>('canvas')].find(isVisibleSquare)
  if (canvas) {
    try {
      return { state: 'ready', qrCode: canvas.toDataURL('image/png') }
    } catch {
      // Continue to the sign-in control fallback.
    }
  }

  // The dedicated login page also contains a phone-login submit button. Open its QR tab first.
  const qrLoginControl = [...document.querySelectorAll('button, [role="button"], a, [tabindex], div, span')].find((element) => {
    const text = element.textContent?.trim()
    return (text === '扫码登录' || text === 'Scan QR code')
      && !element.hasAttribute('disabled')
      && isVisible(element)
  })
  if (qrLoginControl instanceof HTMLElement) {
    qrLoginControl.click()
    return { state: 'loading' }
  }

  // Douyin's React button may wrap the visible label in nested spans.
  const loginControl = [...document.querySelectorAll('button, [role="button"], a, [tabindex], div, span')].find((element) => {
    const text = element.textContent?.trim()
    return (text === '登录' || text === 'Login')
      && !element.hasAttribute('disabled')
      && isVisible(element)
  })
  if (loginControl instanceof HTMLElement) loginControl.click()
  else {
    // On the current desktop homepage, opening "My" is the only sign-in entry.
    const accountControl = [...document.querySelectorAll('button, [role="button"], a, [tabindex], div, span')].find((element) => (
      element.textContent?.trim() === '我的'
      && !element.hasAttribute('disabled')
      && isVisible(element)
    ))
    if (accountControl instanceof HTMLElement) accountControl.click()
  }
  return { state: 'loading' }
}
