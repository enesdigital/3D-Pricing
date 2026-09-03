/**
 * Örnek model: dönel (lathe) piyon. Kapalı/manifold bir mesh üretir; başlık altındaki
 * sarkmalar destek tahminini, gövde de kabuk/dolgu modelini gösterir. Binary STL olarak döner.
 */
export function makeSamplePawnStl(): File {
  // (r, z) profili — z yukarı; r=0 ile başlar ve biter
  const profile: [number, number][] = [
    [0, 0], [22, 0], [22, 4], [18, 6], [12, 9], [9, 14], [8, 34], [11, 37], [14, 39], [14, 42],
    [9, 45], [7, 47], [13, 52], [15, 58], [13, 64], [8, 68], [4, 70], [0, 71],
  ]
  const seg = 72
  const tris: number[] = []
  const push = (...v: number[]) => tris.push(...v)
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, z0] = profile[i], [r1, z1] = profile[i + 1]
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1)
      const p00 = [r0 * c0, r0 * s0, z0], p01 = [r0 * c1, r0 * s1, z0]
      const p10 = [r1 * c0, r1 * s0, z1], p11 = [r1 * c1, r1 * s1, z1]
      // Dışa bakan sarım (saat yönünün tersi, üstten bakınca)
      if (r0 > 0) push(...p00, ...p01, ...p11)
      if (r1 > 0) push(...p00, ...p11, ...p10)
    }
  }
  const n = tris.length / 9
  const buf = new ArrayBuffer(84 + n * 50)
  const dv = new DataView(buf)
  const header = 'Ornek piyon - FDM/SLA Fiyat Hesaplama'
  for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i))
  dv.setUint32(80, n, true)
  let o = 84
  for (let t = 0; t < n; t++) {
    o += 12
    for (let k = 0; k < 9; k++) { dv.setFloat32(o, tris[t * 9 + k], true); o += 4 }
    o += 2
  }
  return new File([buf], 'ornek-piyon.stl', { type: 'model/stl' })
}
