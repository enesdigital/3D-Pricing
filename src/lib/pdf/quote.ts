import type { BusinessSettings, Estimate, FdmPrintParams, Material, PrinterProfile, ResinPrintParams } from '../cost/types.ts'
import type { MeshStats, Placement } from '../mesh/types.ts'
import { formatDuration } from '../cost/engine.ts'
import type { jsPDF as JsPdfType } from 'jspdf'

export interface QuoteInput {
  est: Estimate
  stats: MeshStats
  printer: PrinterProfile
  material: Material
  settings: BusinessSettings
  fdmParams: FdmPrintParams
  resinParams: ResinPrintParams
  placement: Placement
  fileName: string
  triangleCount: number
  customer: string
}

const money = (n: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺'
const num = (n: number, d = 1) => n.toLocaleString('tr-TR', { maximumFractionDigits: d })

export interface QuoteFonts { regular: string; bold: string } // base64 TTF

export function quoteFileName(q: QuoteInput, quoteNo: string): string {
  const safe = q.fileName.replace(/\.[^.]+$/, '').replace(/[^\w\-çğıöşüÇĞİÖŞÜ ]+/g, '_').slice(0, 40)
  return `Teklif_${quoteNo}_${safe}.pdf`
}

/** Teklifi A4 PDF olarak üretir ve tarayıcıda indirme başlatır. Kütüphane ve yazı tipleri tembel yüklenir. */
export async function downloadQuotePdf(q: QuoteInput): Promise<void> {
  const { loadQuoteFonts } = await import('./fonts.ts')
  const fonts = await loadQuoteFonts()
  const { doc, quoteNo } = await buildQuotePdf(q, fonts)
  doc.save(quoteFileName(q, quoteNo))
}

/** PDF belgesini oluşturur (test edilebilir; tarayıcı API'si gerektirmez). */
export async function buildQuotePdf(q: QuoteInput, fonts: QuoteFonts): Promise<{ doc: JsPdfType; quoteNo: string }> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const { regular, bold } = fonts
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.addFileToVFS('DejaVuSans.ttf', regular)
  doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal')
  doc.addFileToVFS('DejaVuSans-Bold.ttf', bold)
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold')
  doc.setFont('DejaVu', 'normal')

  const { est, stats, printer, material, settings } = q
  const W = doc.internal.pageSize.getWidth()
  const M = 15
  const now = new Date()
  const quoteNo = `T-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  const validUntil = new Date(now.getTime() + settings.quoteValidityDays * 86400000)
  const dateStr = (d: Date) => d.toLocaleDateString('tr-TR')
  let y = M

  // --- Başlık ---
  doc.setFont('DejaVu', 'bold'); doc.setFontSize(16)
  doc.text(settings.companyName || '3D Baskı Fiyat Teklifi', M, y + 5)
  doc.setFont('DejaVu', 'normal'); doc.setFontSize(9); doc.setTextColor(90)
  if (settings.companyContact) doc.text(settings.companyContact, M, y + 10)
  doc.setTextColor(0)
  doc.setFont('DejaVu', 'bold'); doc.setFontSize(20); doc.text('TEKLİF', W - M, y + 5, { align: 'right' })
  doc.setFont('DejaVu', 'normal'); doc.setFontSize(9)
  doc.text(`No: ${quoteNo}`, W - M, y + 10, { align: 'right' })
  doc.text(`Tarih: ${dateStr(now)}  ·  Geçerlilik: ${dateStr(validUntil)}`, W - M, y + 14.5, { align: 'right' })
  y += 20
  doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 6

  if (q.customer.trim()) {
    doc.setFontSize(10); doc.setFont('DejaVu', 'bold'); doc.text('Müşteri:', M, y)
    doc.setFont('DejaVu', 'normal'); doc.text(q.customer.trim(), M + 20, y); y += 7
  }

  // --- Model ve baskı bilgileri (iki sütun) ---
  const rot = [q.placement.rotX, q.placement.rotY, q.placement.rotZ]
  const placementStr = `${rot.some((r) => r) ? `döndürme X${rot[0]}° Y${rot[1]}° Z${rot[2]}°` : 'orijinal yön'}${q.placement.scalePct !== 100 ? `, ölçek %${num(q.placement.scalePct, 1)}` : ''}${q.placement.unit === 25.4 ? ', inç' : ''}`
  const modelRows: [string, string][] = [
    ['Dosya', q.fileName],
    ['Boyut (X×Y×Z)', `${num(stats.size.x)} × ${num(stats.size.y)} × ${num(stats.size.z)} mm`],
    ['Hacim', `${num(stats.volume / 1000, 2)} cm³`],
    ['Yüzey alanı', `${num(stats.surfaceArea / 100, 1)} cm²`],
    ['Üçgen', q.triangleCount.toLocaleString('tr-TR')],
    ['Yerleşim', placementStr],
  ]
  const isFdm = est.tech === 'fdm'
  const fp = q.fdmParams, rp = q.resinParams
  const printRows: [string, string][] = [
    ['Yazıcı', `${printer.brand} ${printer.name} (${isFdm ? 'FDM' : 'Reçine'})`],
    ['Malzeme', `${material.name} · ${num(material.density, 2)} g/cm³`],
    isFdm
      ? ['Profil', `${fp.layerHeight} mm katman · ${fp.wallLoops} duvar · %${Math.round(fp.infillDensity * 100)} dolgu · ${fp.topBottomLayers} üst/alt`]
      : ['Profil', `${rp.layerHeight} mm katman · ${rp.exposureSec} s pozlama · ${rp.bottomLayers}×${rp.bottomExposureSec} s taban${rp.hollow ? ` · boşaltma ${rp.hollowWallMm} mm` : ''}`],
    ['Destek', isFdm ? (fp.supports === 'off' ? 'kapalı' : est.perUnit.supportGrams > 0 ? `var (%${Math.round(fp.supportDensity * 100)})` : 'gerekmiyor') : (rp.supports === 'off' ? 'kapalı' : est.perUnit.supportGrams > 0 ? 'var' : 'gerekmiyor')],
    ['Adet / tabla', `${est.quantity} adet · ${est.plates} tabla (${est.partsPerPlate} parça/tabla)`],
    ['Süre', `tabla ${formatDuration(est.plateTimeSec)} · toplam ${formatDuration(est.total.printTimeSec)}`],
  ]
  const colW = (W - 2 * M - 6) / 2
  autoTable(doc, {
    startY: y, margin: { left: M }, tableWidth: colW, theme: 'plain',
    styles: { font: 'DejaVu', fontSize: 8.5, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 28, textColor: 80 } },
    head: [[{ content: 'MODEL', colSpan: 2, styles: { fontStyle: 'bold', textColor: 30, fontSize: 9 } }]],
    body: modelRows,
  })
  const leftEnd = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  autoTable(doc, {
    startY: y, margin: { left: M + colW + 6 }, tableWidth: colW, theme: 'plain',
    styles: { font: 'DejaVu', fontSize: 8.5, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 26, textColor: 80 } },
    head: [[{ content: 'BASKI', colSpan: 2, styles: { fontStyle: 'bold', textColor: 30, fontSize: 9 } }]],
    body: printRows,
  })
  y = Math.max(leftEnd, (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 6

  // --- Maliyet kalemleri ---
  autoTable(doc, {
    startY: y, margin: { left: M, right: M }, theme: 'striped',
    styles: { font: 'DejaVu', fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [14, 116, 184], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 55 }, 2: { halign: 'right', cellWidth: 35 } },
    head: [['Kalem', 'Açıklama', 'Tutar']],
    body: est.lines.map((l) => [l.label, l.detail ?? '', money(l.amount)]),
    foot: [[{ content: `Toplam maliyet${est.quantity > 1 ? ` (${est.quantity} adet)` : ''}`, colSpan: 2, styles: { fontStyle: 'bold' } }, { content: money(est.total.cost), styles: { halign: 'right', fontStyle: 'bold' } }]],
    footStyles: { fillColor: [240, 240, 240], textColor: 20 },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6

  // --- Fiyat özeti ---
  const vatAmt = est.total.priceWithVat - est.total.price
  const summary: [string, string][] = [
    [`Kâr marjı (%${Math.round(settings.markup * 100)})`, money(est.total.price - est.total.cost)],
    ...(est.total.price <= settings.minimumPriceTRY + 0.001 ? [['Minimum sipariş tutarı uygulandı', ''] as [string, string]] : []),
    ['Fiyat (KDV hariç)', money(est.total.price)],
    [`KDV (%${Math.round(settings.vat * 100)})`, money(vatAmt)],
  ]
  autoTable(doc, {
    startY: y, margin: { left: W - M - 90 }, tableWidth: 90, theme: 'plain',
    styles: { font: 'DejaVu', fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    body: summary,
    foot: [[{ content: 'GENEL TOPLAM (KDV dahil)', styles: { fontStyle: 'bold', fontSize: 10 } }, { content: money(est.total.priceWithVat), styles: { halign: 'right', fontStyle: 'bold', fontSize: 11 } }]],
    footStyles: { fillColor: [14, 116, 184], textColor: 255 },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3
  if (est.quantity > 1) {
    doc.setFontSize(9); doc.setTextColor(60)
    doc.text(`Birim fiyat: ${money(est.perUnit.price)} (KDV hariç) · ${money(est.perUnit.priceWithVat)} (KDV dahil)`, W - M, y + 3, { align: 'right' })
    doc.setTextColor(0); y += 6
  }
  y += 4

  // --- Malzeme/süre özeti ---
  doc.setFontSize(9); doc.setFont('DejaVu', 'bold'); doc.text('Üretim özeti', M, y); y += 4.5
  doc.setFont('DejaVu', 'normal'); doc.setTextColor(60)
  const prod = [
    `Malzeme: ${est.total.materialGrams >= 1000 ? `${num(est.total.materialGrams / 1000, 2)} kg` : `${num(est.total.materialGrams, 1)} g`} toplam (adet başına ${num(est.perUnit.materialGrams, 1)} g${est.perUnit.supportGrams > 0 ? `, destek ${num(est.perUnit.supportGrams, 1)} g` : ''})`,
    `Süre: ${formatDuration(est.total.printTimeSec)} toplam makine süresi · ${est.layerCount} katman · enerji ${num(est.total.energyKWh, 2)} kWh`,
  ]
  for (const line of prod) { doc.text(line, M, y); y += 4.5 }
  doc.setTextColor(0); y += 2

  // --- Uyarılar ve notlar ---
  if (est.warnings.length) {
    doc.setFont('DejaVu', 'bold'); doc.setFontSize(9); doc.text('Uyarılar', M, y); y += 4.5
    doc.setFont('DejaVu', 'normal'); doc.setFontSize(8.5); doc.setTextColor(150, 80, 0)
    for (const w of est.warnings) {
      const lines = doc.splitTextToSize(`• ${w}`, W - 2 * M) as string[]
      doc.text(lines, M, y); y += lines.length * 4
    }
    doc.setTextColor(0); y += 2
  }
  if (settings.quoteNote.trim()) {
    doc.setFont('DejaVu', 'bold'); doc.setFontSize(9); doc.text('Notlar', M, y); y += 4.5
    doc.setFont('DejaVu', 'normal'); doc.setFontSize(8.5); doc.setTextColor(60)
    const lines = doc.splitTextToSize(settings.quoteNote.trim(), W - 2 * M) as string[]
    doc.text(lines, M, y); y += lines.length * 4
    doc.setTextColor(0)
  }

  // --- Altbilgi ---
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5); doc.setTextColor(130)
    doc.text(`${settings.companyName || 'FDM / SLA Baskı Fiyat Hesaplama'} · ${quoteNo} · Bu belge STL geometrisinden hesaplanan tahmini bir tekliftir.`, M, 290)
    doc.text(`${i} / ${pages}`, W - M, 290, { align: 'right' })
    doc.setTextColor(0)
  }

  return { doc, quoteNo }
}
