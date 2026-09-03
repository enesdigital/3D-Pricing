import fontRegularUrl from '../../assets/fonts/DejaVuSans.ttf?url'
import fontBoldUrl from '../../assets/fonts/DejaVuSans-Bold.ttf?url'
import type { QuoteFonts } from './quote.ts'

async function fetchBase64(url: string): Promise<string> {
  const buf = await (await fetch(url)).arrayBuffer()
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

let cache: Promise<QuoteFonts> | null = null
/** DejaVu Sans (Türkçe karakter desteği) — alt kümelenmiş TTF, ilk kullanımda yüklenir ve önbelleğe alınır. */
export function loadQuoteFonts(): Promise<QuoteFonts> {
  cache ??= Promise.all([fetchBase64(fontRegularUrl), fetchBase64(fontBoldUrl)]).then(([regular, bold]) => ({ regular, bold }))
  return cache
}
