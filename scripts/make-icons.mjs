// PWA ikonlarını (192/512 ve maskable 512) favicon.svg'deki küp çiziminden saf JS ile üretir.
// Bağımlılık yok: çokgen rasterizer (even-odd, 4×4 süper örnekleme) + zlib PNG kodlayıcı.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const BLUE = [2, 132, 199], WHITE = [255, 255, 255]
// favicon.svg yolu (64×64 koordinat): dış altıgen + üst/sol/sağ yüzler (even-odd → yalnızca kenar çizgileri beyaz)
const outer = [[32, 10], [14, 20], [14, 44], [32, 54], [50, 44], [50, 20]]
const top = [[32, 16], [44, 22.7], [32, 29.4], [20, 22.7]]
const left = [[18, 28.3], [30, 35], [30, 49], [18, 42.3]]
const right = [[46, 28.3], [46, 42.3], [34, 49], [34, 35]]

const inside = (poly, x, y) => { // even-odd
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
const inRoundedRect = (x, y, size, r) => {
  if (r <= 0) return true
  const cx = Math.min(Math.max(x, r), size - r), cy = Math.min(Math.max(y, r), size - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

function render(size, { maskable }) {
  const SS = 4, px = new Uint8Array(size * size * 4)
  const scale = size / 64
  const pad = maskable ? 0.8 : 1 // maskable: güvenli bölge için %80 ölçek, tam kare zemin
  const rx = maskable ? 0 : 14 * scale
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const fx = x + (sx + 0.5) / SS, fy = y + (sy + 0.5) / SS
      if (!inRoundedRect(fx, fy, size, rx)) continue
      // ikon koordinatına çevir (maskable: merkez etrafında küçült)
      const ux = ((fx / size - 0.5) / pad + 0.5) * 64, uy = ((fy / size - 0.5) / pad + 0.5) * 64
      let col = BLUE
      if (inside(outer, ux, uy) && !inside(top, ux, uy) && !inside(left, ux, uy) && !inside(right, ux, uy)) col = WHITE
      r += col[0]; g += col[1]; b += col[2]; a += 255
    }
    const n = SS * SS, i = (y * size + x) * 4
    const cov = a / n
    px[i] = cov > 0 ? Math.round(r / (a / 255)) : 0; px[i + 1] = cov > 0 ? Math.round(g / (a / 255)) : 0; px[i + 2] = cov > 0 ? Math.round(b / (a / 255)) : 0; px[i + 3] = Math.round(cov)
  }
  return encodePng(size, size, px)
}

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/icon-192.png', render(192, { maskable: false }))
writeFileSync('public/icons/icon-512.png', render(512, { maskable: false }))
writeFileSync('public/icons/maskable-512.png', render(512, { maskable: true }))
writeFileSync('public/icons/apple-touch-icon.png', render(180, { maskable: true }))
console.log('icons written: public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png')
