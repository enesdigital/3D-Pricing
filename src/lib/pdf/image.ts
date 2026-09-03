/** PNG/JPEG/SVG dosyasını en fazla maxW piksel genişliğinde PNG data URL'e çevirir (SVG rasterize edilir). */
export function fileToPngDataUrl(file: File, maxW = 800, maxH = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 5 * 1024 * 1024) { reject(new Error('Logo 5 MB\'tan küçük olmalı.')); return }
    const ok = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
    if (!ok.includes(file.type) && !/\.(png|jpe?g|svg|webp)$/i.test(file.name)) { reject(new Error('PNG, JPEG, WebP veya SVG yükleyin.')); return }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Dosya okunamadı.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Görsel çözümlenemedi (SVG ise dış kaynak içermemeli).'))
      img.onload = () => {
        let w = img.naturalWidth || 800, h = img.naturalHeight || 400
        const k = Math.min(1, maxW / w, maxH / h)
        w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k))
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        const ctx = c.getContext('2d')
        if (!ctx) { reject(new Error('Canvas desteklenmiyor.')); return }
        ctx.drawImage(img, 0, 0, w, h)
        const png = c.toDataURL('image/png')
        // Kalıcı depolama kota koruması: PNG büyükse beyaz zemine yerleştirip JPEG ile küçült.
        let out = png
        if (png.length > 512 * 1024) {
          const c2 = document.createElement('canvas')
          c2.width = w; c2.height = h
          const ctx2 = c2.getContext('2d')
          if (ctx2) {
            ctx2.fillStyle = '#ffffff'; ctx2.fillRect(0, 0, w, h)
            ctx2.drawImage(img, 0, 0, w, h)
            const jpg = c2.toDataURL('image/jpeg', 0.85)
            if (jpg.length < png.length) out = jpg
          }
        }
        if (out.length > 2 * 1024 * 1024) { reject(new Error('Logo çok büyük; lütfen daha küçük veya sade bir görsel kullanın.')); return }
        resolve(out)
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

/** Data URL'deki PNG'nin piksel boyutları */
export function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => reject(new Error('Görsel okunamadı'))
    img.src = dataUrl
  })
}
