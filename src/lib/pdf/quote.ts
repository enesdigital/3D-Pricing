import type { BusinessSettings, Estimate, FdmPrintParams, Material, PrinterProfile, ResinPrintParams } from '../cost/types.ts'
import type { MeshStats, Placement } from '../mesh/types.ts'
import { formatDuration } from '../cost/engine.ts'
import type { jsPDF as JsPdfType } from 'jspdf'

export interface QuotePricing {
  /** Adet başına KDV hariç fiyat */
  unitPrice: number
  /** Toplam KDV hariç */
  total: number
  vatRate: number
  /** Açıklama: "kâr marjı %50" ya da "elle girildi" */
  basis: string
}

export interface QuoteImage { dataUrl: string; w: number; h: number }

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
  pricing: QuotePricing
  logo: QuoteImage | null
  modelImage: QuoteImage | null
  includeProduction: boolean
}

export interface QuoteFonts { regular: string; bold: string } // base64 TTF

const money = (n: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺'
const num = (n: number, d = 1) => n.toLocaleString('tr-TR', { maximumFractionDigits: d })

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

type WithTable = { lastAutoTable: { finalY: number } }

/** PDF belgesini oluşturur (test edilebilir; tarayıcı API'si gerektirmez). */
export async function buildQuotePdf(q: QuoteInput, fonts: QuoteFonts): Promise<{ doc: JsPdfType; quoteNo: string }> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.addFileToVFS('DejaVuSans.ttf', fonts.regular)
  doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal')
  doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold)
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold')
  doc.setFont('DejaVu', 'normal')

  const { est, stats, printer, material, settings, pricing } = q
  const W = doc.internal.pageSize.getWidth()
  const M = 15
  const now = new Date()
  const quoteNo = `T-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  const validUntil = new Date(now.getTime() + settings.quoteValidityDays * 86400000)
  const dateStr = (d: Date) => d.toLocaleDateString('tr-TR')
  const finalY = () => (doc as unknown as WithTable).lastAutoTable.finalY
  let y = M

  // --- Başlık: logo + firma / TEKLİF ---
  let textX = M
  if (q.logo) {
    const maxW = 45, maxH = 18
    const k = Math.min(maxW / q.logo.w, maxH / q.logo.h)
    const lw = q.logo.w * k, lh = q.logo.h * k
    doc.addImage(q.logo.dataUrl, 'PNG', M, y, lw, lh)
    textX = M + lw + 5
  }
  doc.setFont('DejaVu', 'bold'); doc.setFontSize(15)
  doc.text(settings.companyName || '3D Baskı Fiyat Teklifi', textX, y + 6)
  doc.setFont('DejaVu', 'normal'); doc.setFontSize(9); doc.setTextColor(90)
  if (settings.companyContact) doc.text(doc.splitTextToSize(settings.companyContact, W - textX - M - 60) as string[], textX, y + 11)
  doc.setTextColor(0)
  doc.setFont('DejaVu', 'bold'); doc.setFontSize(20); doc.text('TEKLİF', W - M, y + 6, { align: 'right' })
  doc.setFont('DejaVu', 'normal'); doc.setFontSize(9)
  doc.text(`No: ${quoteNo}`, W - M, y + 11, { align: 'right' })
  doc.text(`Tarih: ${dateStr(now)}  ·  Geçerlilik: ${dateStr(validUntil)}`, W - M, y + 15.5, { align: 'right' })
  y += 22
  doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 6

  if (q.customer.trim()) {
    doc.setFontSize(10); doc.setFont('DejaVu', 'bold'); doc.text('Sayın', M, y)
    doc.setFont('DejaVu', 'normal'); doc.text(q.customer.trim(), M + 12, y); y += 7
  }

  // --- Model görseli (sol) + bilgi tablosu (sağ) ---
  const imgW = 78
  const imgTop = y
  let imgBottom = y
  if (q.modelImage) {
    const ih = Math.min(65, (imgW * q.modelImage.h) / q.modelImage.w)
    const iw = (ih * q.modelImage.w) / q.modelImage.h
    doc.setDrawColor(220); doc.setFillColor(248, 248, 248)
    doc.roundedRect(M, imgTop, imgW, ih + 4, 2, 2, 'FD')
    doc.addImage(q.modelImage.dataUrl, 'PNG', M + (imgW - iw) / 2, imgTop + 2, iw, ih)
    imgBottom = imgTop + ih + 4
  }
  const infoX = q.modelImage ? M + imgW + 6 : M
  const infoW = W - M - infoX
  const isFdm = est.tech === 'fdm'
  const fp = q.fdmParams, rp = q.resinParams
  const quality = isFdm
    ? `${fp.layerHeight} mm katman · ${fp.wallLoops} duvar · %${Math.round(fp.infillDensity * 100)} dolgu`
    : `${rp.layerHeight} mm katman${rp.hollow ? ' · boşaltılmış' : ''}`
  const rows: [string, string][] = [
    ['Model', `${q.fileName}`],
    ['Boyut', `${num(stats.size.x)} × ${num(stats.size.y)} × ${num(stats.size.z)} mm${q.placement.scalePct !== 100 ? ` (ölçek %${num(q.placement.scalePct, 1)})` : ''}`],
    ['Teknoloji', `${isFdm ? 'FDM' : 'Reçine (MSLA)'} · ${printer.brand} ${printer.name}`],
    ['Malzeme', material.name],
    ['Kalite', quality],
    ['Adet', `${est.quantity}`],
    ['Tahmini üretim', `${formatDuration(est.total.printTimeSec)} makine süresi${est.plates > 1 ? ` (${est.plates} parti)` : ''}`],
  ]
  autoTable(doc, {
    startY: imgTop, margin: { left: infoX }, tableWidth: infoW, theme: 'plain',
    styles: { font: 'DejaVu', fontSize: 8.5, cellPadding: 1.3 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30, textColor: 80 } },
    body: rows,
  })
  y = Math.max(imgBottom, finalY()) + 8

  // --- Fiyat tablosu (kalemsiz) ---
  const vatAmt = pricing.total * pricing.vatRate
  autoTable(doc, {
    startY: y, margin: { left: M, right: M }, theme: 'grid',
    styles: { font: 'DejaVu', fontSize: 9.5, cellPadding: 2.5, lineColor: [220, 220, 220] },
    headStyles: { fillColor: [14, 116, 184], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'center', cellWidth: 22 }, 2: { halign: 'right', cellWidth: 38 }, 3: { halign: 'right', cellWidth: 38 } },
    head: [['Açıklama', 'Adet', 'Birim fiyat', 'Tutar']],
    body: [[
      `3D baskı hizmeti — ${q.fileName.replace(/\.[^.]+$/, '')}\n${isFdm ? 'FDM' : 'Reçine'} · ${material.name} · ${quality}${est.perUnit.supportGrams > 0 ? ' · destekli' : ''}`,
      String(est.quantity), money(pricing.unitPrice), money(pricing.total),
    ]],
  })
  y = finalY() + 2
  autoTable(doc, {
    startY: y, margin: { left: W - M - 98 }, tableWidth: 98, theme: 'plain',
    styles: { font: 'DejaVu', fontSize: 9.5, cellPadding: 1.8 },
    columnStyles: { 0: { cellWidth: 55 }, 1: { halign: 'right', fontStyle: 'bold' } },
    body: [
      ['Ara toplam (KDV hariç)', money(pricing.total)],
      [`KDV (%${Math.round(pricing.vatRate * 100)})`, money(vatAmt)],
    ],
    foot: [[{ content: 'GENEL TOPLAM', styles: { fontStyle: 'bold', fontSize: 10.5 } }, { content: money(pricing.total + vatAmt), styles: { halign: 'right', fontStyle: 'bold', fontSize: 11.5 } }]],
    footStyles: { fillColor: [14, 116, 184], textColor: 255 },
  })
  y = finalY() + 8

  // --- Üretim bilgisi (isteğe bağlı) ---
  if (q.includeProduction) {
    doc.setFontSize(9); doc.setFont('DejaVu', 'bold'); doc.text('Üretim bilgisi', M, y); y += 4.5
    doc.setFont('DejaVu', 'normal'); doc.setTextColor(60)
    const lines = [
      `Malzeme: adet başına yaklaşık ${num(est.perUnit.materialGrams, 0)} g${est.perUnit.supportGrams > 0 ? ` (destek dahil)` : ''} · toplam ${est.total.materialGrams >= 1000 ? `${num(est.total.materialGrams / 1000, 2)} kg` : `${num(est.total.materialGrams, 0)} g`}`,
      `Süre: tabla başına ${formatDuration(est.plateTimeSec)} · toplam ${formatDuration(est.total.printTimeSec)} · ${est.layerCount} katman`,
      isFdm ? `Yerleşim: tabla başına ${est.partsPerPlate} parça · ${est.plates} parti` : `Yerleşim: tabla başına ${est.partsPerPlate} parça · ${est.plates} parti · yıkama ve UV kürleme dahil`,
    ]
    for (const l of lines) { doc.text(l, M, y); y += 4.5 }
    doc.setTextColor(0); y += 3
  }

  // --- Notlar ---
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
    doc.text(`${settings.companyName || '3D Baskı Fiyat Teklifi'} · ${quoteNo} · Fiyatlandırma: ${pricing.basis}`, M, 290)
    doc.text(`${i} / ${pages}`, W - M, 290, { align: 'right' })
    doc.setTextColor(0)
  }
  return { doc, quoteNo }
}
