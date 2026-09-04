import { encodeShare, decodeShare, quoteCsv, whatsappUrl, type SharedQuote } from '../src/lib/share.ts'
const q: SharedQuote = { v: 1, date: '2026-09-03', company: 'Enes 3D', contact: '+90 555', customer: 'Şükrü Ğüneş', model: 'piyon.stl', sizeMm: [44, 44, 71], printer: 'Bambu Lab H2D', tech: 'fdm', material: 'PLA Basic (Bambu Lab)', qty: 10, unit: 69.5, total: 695, vatRate: 0.2, currency: 'TRY', fxRate: 1, leadDays: 2, note: 'Fiyatlar tahmini' }
const enc = encodeShare(q); const dec = decodeShare(enc)
const assert = (c: boolean, msg: string) => { if (!c) { console.error('FAIL:', msg); process.exit(1) } }
assert(JSON.stringify(dec) === JSON.stringify(q) && decodeShare('xyz') === null, 'paylaşım gidiş-dönüş')
console.log('share: encoded', enc.length, 'karakter | roundtrip', JSON.stringify(dec) === JSON.stringify(q) ? 'OK' : 'FARKLI', '| bozuk →', decodeShare('xyz'))
console.log('wa:', whatsappUrl('+90 (555) 000 00 00', 'Merhaba Şükrü').slice(0, 60))
const est = { quantity: 10, lines: [{ key: 'm', label: 'Model malzemesi', detail: '10 × 15 g', amount: 150 }], total: { cost: 500, materialGrams: 200, printTimeSec: 7200, energyKWh: 1.2 }, plates: 1, leadDays: 2 } as never
const csv = quoteCsv(est, { unitPrice: 69.5, total: 695, vatRate: 0.2, basis: 'x' }, { model: 'piyon.stl', printer: 'H2D', material: 'PLA', currency: 'TRY' })
assert(whatsappUrl('+90 (555) 000 00 00', 'x').startsWith('https://wa.me/905550000000?text=') && csv.charCodeAt(0) === 0xfeff && csv.split('\r\n').length > 10, 'wa/csv')
console.log('csv satır:', csv.split('\r\n').length, '| BOM', csv.charCodeAt(0) === 0xfeff, '|', csv.split('\r\n')[6])
console.log('SHARE_FRAGMENT=' + enc)
console.log('share: OK')
