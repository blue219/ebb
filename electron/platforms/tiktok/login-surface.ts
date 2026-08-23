/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

export async function detectTikTokLoginSurface() {
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
  if (/complete verification|security verification|verify to continue|captcha|two-step verification|2-step verification|验证码|安全验证/i.test(pageText)) {
    return { state: 'verification' }
  }

  const image = [...document.querySelectorAll<HTMLImageElement>('img')].find((candidate) => {
    if (!isVisibleSquare(candidate)) return false
    const source = candidate.currentSrc || candidate.src
    const hint = `${candidate.alt} ${candidate.className} ${candidate.closest('[data-e2e], [class], [id]')?.outerHTML.slice(0, 300) || ''}`
    return /qr|scan code/i.test(hint) || source.startsWith('data:image/')
  })
  if (image) {
    const source = image.currentSrc || image.src
    if (source.startsWith('data:image/')) return { state: 'ready', qrCode: source }
    if (source) {
      try {
        const response = await fetch(source, { credentials: 'include' })
        const blob = await response.blob()
        if (blob.size > 750_000 || !['image/png', 'image/jpeg', 'image/webp'].includes(blob.type.toLowerCase())) {
          return { state: 'loading' }
        }
        const qrCode = await new Promise<string | ArrayBuffer | null>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(blob)
        })
        return { state: 'ready', qrCode }
      } catch {
        return { state: 'loading' }
      }
    }
  }

  const canvas = [...document.querySelectorAll<HTMLCanvasElement>('canvas')].find(isVisibleSquare)
  if (canvas) {
    try {
      return { state: 'ready', qrCode: canvas.toDataURL('image/png') }
    } catch {
      return { state: 'loading' }
    }
  }

  return { state: 'loading' }
}
