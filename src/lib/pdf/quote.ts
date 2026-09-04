import type { BusinessSettings, Estimate, FdmPrintParams, Material, PrinterProfile, ResinPrintParams, Translate } from '../cost/types.ts'
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
  /** Çok parçalı proje: parça listesi (varsa model satırı ve hizmet açıklaması proje olarak yazılır) */
  parts?: { name: string; quantity: number; size: { x: number; y: number; z: number }; unitPrice: number; total: number }[]
  /** Dışarıdan verilen teklif numarası (geçmişe kayıtla aynı olsun diye) */
  quoteNo?: string
}

export interface QuoteFonts { regular: string; bold: string } // base64 TTF

import { fmtMoney } from '../cost/engine.ts'
let money = (n: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺'
const num = (n: number, d = 1) => n.toLocaleString('tr-TR', { maximumFractionDigits: d })

export function quoteFileName(q: QuoteInput, quoteNo: string, t: Translate): string {
  const safe = q.fileName.replace(/\.[^.]+$/, '').replace(/[^\w\-çğıöşüÇĞİÖŞÜ ]+/g, '_').slice(0, 40)
  return `${t('pdf.fileNamePrefix')}_${quoteNo}_${safe}.pdf`
}

/** Teklifi A4 PDF olarak üretir ve tarayıcıda indirme başlatır. Kütüphane ve yazı tipleri tembel yüklenir. */
export async function downloadQuotePdf(q: QuoteInput, t: Translate): Promise<string> {
  const { loadQuoteFonts } = await import('./fonts')
  const fonts = await loadQuoteFonts()
  const { doc, quoteNo } = await buildQuotePdf(q, fonts, t)
  doc.save(quoteFileName(q, quoteNo, t))
  return quoteNo
}

/** Teklif numarası: T-YYYYMMDD-HHMMSS (verilmişse dışarıdan gelen numara kullanılır) */
export function makeQuoteNo(now = new Date()): string {
  return `T-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
}

type WithTable = { lastAutoTable: { finalY: number } }

/** Data URL başlığından jsPDF görsel formatını türetir (logo artık JPEG olabilir). */
function imgFormat(dataUrl: string): 'PNG' | 'JPEG' {
  return /^data:image\/jpe?g/i.test(dataUrl) ? 'JPEG' : 'PNG'
}

/** PDF belgesini oluşturur (test edilebilir; tarayıcı API'si gerektirmez). */
export async function buildQuotePdf(q: QuoteInput, fonts: QuoteFonts, t: Translate): Promise<{ doc: JsPdfType; quoteNo: string }> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.addFileToVFS('DejaVuSans.ttf', fonts.regular)
  doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal')
  doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold)
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold')
  doc.setFont('DejaVu', 'normal')

  const { est, stats, printer, material, settings, pricing } = q
  money = (n: number) => fmtMoney(n, settings)
  const W = doc.internal.pageSize.getWidth()
  const M = 15
  const now = new Date()
  const quoteNo = q.quoteNo ?? makeQuoteNo(now)
  const validUntil = new Date(now.getTime() + settings.quoteValidityDays * 86400000)
  const dateStr = (d: Date) => d.toLocaleDateString('tr-TR')
  const finalY = () => (doc as unknown as WithTable).lastAutoTable.finalY
  let y = M
  const pageH = doc.internal.pageSize.getHeight()
  /** Kalan alan yetmiyorsa yeni sayfa aç (altbilgi için 20 mm pay). */
  const ensure = (needed: number) => { if (y + needed > pageH - 20) { doc.addPage(); y = M } }

  // --- Başlık: logo + firma / TEKLİF ---
  let textX = M
  if (q.logo) {
    const maxW = 45, maxH = 18
    const k = Math.min(maxW / q.logo.w, maxH / q.logo.h)
    const lw = q.logo.w * k, lh = q.logo.h * k
    doc.addImage(q.logo.dataUrl, imgFormat(q.logo.dataUrl), M, y, lw, lh)
    textX = M + lw + 5
  }
  doc.setFont('DejaVu', 'bold'); doc.setFontSize(15)
  doc.text(settings.companyName || t('pdf.defaultTitle'), textX, y + 6)
  doc.setFont('DejaVu', 'normal'); doc.setFontSize(9); doc.setTextColor(90)
  if (settings.companyContact) doc.text(doc.splitTextToSize(settings.companyContact, W - textX - M - 60) as string[], textX, y + 11)
  doc.setTextColor(0)
  doc.setFont('DejaVu', 'bold'); doc.setFontSize(20); doc.text(t('pdf.heading'), W - M, y + 6, { align: 'right' })
  doc.setFont('DejaVu', 'normal'); doc.setFontSize(9)
  doc.text(t('pdf.no', { no: quoteNo }), W - M, y + 11, { align: 'right' })
  doc.text(t('pdf.dateValidity', { date: dateStr(now), valid: dateStr(validUntil) }), W - M, y + 15.5, { align: 'right' })
  y += 22
  doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 6

  if (q.customer.trim()) {
    doc.setFontSize(10); doc.setFont('DejaVu', 'bold'); doc.text(t('pdf.dear'), M, y)
    doc.setFont('DejaVu', 'normal')
    const custLines = doc.splitTextToSize(q.customer.trim(), W - 2 * M - 12) as string[]
    doc.text(custLines, M + 12, y); y += 4.5 * custLines.length + 2.5
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
    doc.addImage(q.modelImage.dataUrl, imgFormat(q.modelImage.dataUrl), M + (imgW - iw) / 2, imgTop + 2, iw, ih)
    imgBottom = imgTop + ih + 4
  }
  const infoX = q.modelImage ? M + imgW + 6 : M
  const infoW = W - M - infoX
  const isFdm = est.tech === 'fdm'
  const fp = q.fdmParams, rp = q.resinParams
  const quality = isFdm
    ? t('pdf.qualityFdm', { lh: fp.layerHeight, walls: fp.wallLoops, infill: Math.round(fp.infillDensity * 100) })
    : t('pdf.qualityResin', { lh: rp.layerHeight }) + (rp.hollow ? t('pdf.qualityResinHollow') : '')
  const parts = q.parts && q.parts.length > 1 ? q.parts : null
  const rows: [string, string][] = parts ? [
    [t('pdf.rowProject'), t('pdf.projectModel', { n: parts.length, names: parts.map((p) => p.name).join(', ') })],
  ] : [
    [t('pdf.rowModel'), `${q.fileName}`],
    [t('pdf.rowSize'), `${num(stats.size.x)} × ${num(stats.size.y)} × ${num(stats.size.z)} mm${q.placement.scalePct !== 100 ? t('pdf.scale', { n: num(q.placement.scalePct, 1) }) : ''}`],
  ]
  rows.push(
    [t('pdf.rowTech'), `${isFdm ? t('pdf.techFdm') : t('pdf.techResin')} · ${printer.brand} ${printer.name}`],
    [t('pdf.rowMaterial'), material.name],
    [t('pdf.rowQuality'), quality],
    [t('pdf.rowQuantity'), `${est.quantity}`],
    [t('pdf.rowDelivery'), t('pdf.deliveryDays', { n: est.leadDays })],
    [t('pdf.rowProduction'), `${t('pdf.machineTime', { dur: formatDuration(est.total.printTimeSec, t) })}${est.plates > 1 ? t('pdf.plates', { n: est.plates }) : ''}`],
  )
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
    head: [[t('pdf.thDescription'), t('pdf.thQuantity'), t('pdf.thUnitPrice'), t('pdf.thAmount')]],
    body: [[
      `${parts ? t('pdf.projectService', { n: parts.length }) : t('pdf.serviceTitle', { name: q.fileName.replace(/\.[^.]+$/, '') })}\n${t('pdf.serviceDesc', { tech: isFdm ? t('pdf.techFdmShort') : t('pdf.techResinShort'), mat: material.name, quality })}${est.perUnit.supportGrams > 0 ? t('pdf.supported') : ''}`,
      String(est.quantity), money(pricing.unitPrice), money(pricing.total),
    ]],
  })
  y = finalY() + 2
  if (parts) {
    // Parça listesi: birim/toplam fiyatlar teklif fiyatı ile aynı oranda ölçeklenir (kâr/elle giriş)
    const scale = est.total.price > 0 ? pricing.total / est.total.price : 1
    autoTable(doc, {
      startY: y, margin: { left: M, right: M }, theme: 'striped',
      styles: { font: 'DejaVu', fontSize: 8.5, cellPadding: 1.8 },
      headStyles: { fillColor: [235, 240, 245], textColor: 40, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'center', cellWidth: 40 }, 2: { halign: 'center', cellWidth: 18 }, 3: { halign: 'right', cellWidth: 32 }, 4: { halign: 'right', cellWidth: 32 } },
      head: [[t('pdf.thPart'), t('pdf.thSize'), t('pdf.thQty'), t('pdf.thUnit'), t('pdf.thTotal')]],
      body: parts.map((p) => [p.name, `${num(p.size.x, 0)} × ${num(p.size.y, 0)} × ${num(p.size.z, 0)}`, String(p.quantity), money(p.unitPrice * scale), money(p.total * scale)]),
    })
    y = finalY() + 2
  }
  autoTable(doc, {
    startY: y, margin: { left: W - M - 98 }, tableWidth: 98, theme: 'plain',
    styles: { font: 'DejaVu', fontSize: 9.5, cellPadding: 1.8 },
    columnStyles: { 0: { cellWidth: 55 }, 1: { halign: 'right', fontStyle: 'bold' } },
    body: [
      [t('pdf.subtotal'), money(pricing.total)],
      [t('pdf.vat', { n: Math.round(pricing.vatRate * 100) }), money(vatAmt)],
    ],
    foot: [[{ content: t('pdf.grandTotal'), styles: { fontStyle: 'bold', fontSize: 10.5 } }, { content: money(pricing.total + vatAmt), styles: { halign: 'right', fontStyle: 'bold', fontSize: 11.5 } }]],
    footStyles: { fillColor: [14, 116, 184], textColor: 255 },
  })
  y = finalY() + 8

  // --- Üretim bilgisi (isteğe bağlı) ---
  if (q.includeProduction) {
    ensure(24)
    doc.setFontSize(9); doc.setFont('DejaVu', 'bold'); doc.text(t('pdf.productionTitle'), M, y); y += 4.5
    doc.setFont('DejaVu', 'normal'); doc.setTextColor(60)
    const totalMat = est.total.materialGrams >= 1000 ? `${num(est.total.materialGrams / 1000, 2)} kg` : `${num(est.total.materialGrams, 0)} g`
    const lines = [
      t('pdf.prodMaterial', { g: num(est.perUnit.materialGrams, 0), support: est.perUnit.supportGrams > 0 ? t('pdf.prodMaterialSupport') : '', total: totalMat }),
      t('pdf.prodTime', { plate: formatDuration(est.plateTimeSec, t), total: formatDuration(est.total.printTimeSec, t), layers: est.layerCount }),
      isFdm ? t('pdf.prodLayoutFdm', { parts: est.partsPerPlate, plates: est.plates }) : t('pdf.prodLayoutResin', { parts: est.partsPerPlate, plates: est.plates }),
    ]
    for (const l of lines) { const wrapped = doc.splitTextToSize(l, W - 2 * M) as string[]; ensure(4.5 * wrapped.length); doc.text(wrapped, M, y); y += 4.5 * wrapped.length }
    doc.setTextColor(0); y += 3
  }

  // --- İndirim / kur dipnotu ---
  {
    const extra: string[] = []
    if (est.discountPct > 0 && /kâr|margin|marj/i.test(pricing.basis)) extra.push(t('pdf.discountNote', { pct: Math.round(est.discountPct * 100) }))
    if (settings.displayCurrency && settings.displayCurrency !== 'TRY') extra.push(t('pdf.fxNote', { cur: settings.displayCurrency, rate: (settings.fxRates?.[settings.displayCurrency] ?? 0).toFixed(2), date: settings.fxRates?.updatedAt || '—' }))
    if (extra.length) { ensure(6 * extra.length); doc.setFontSize(8); doc.setTextColor(90); for (const l of extra) { doc.text(l, M, y); y += 4.5 } doc.setTextColor(0); y += 2 }
  }

  // --- Notlar ---
  if (settings.quoteNote.trim()) {
    ensure(14)
    doc.setFont('DejaVu', 'bold'); doc.setFontSize(9); doc.text(t('pdf.notesTitle'), M, y); y += 4.5
    doc.setFont('DejaVu', 'normal'); doc.setFontSize(8.5); doc.setTextColor(60)
    const lines = doc.splitTextToSize(settings.quoteNote.trim(), W - 2 * M) as string[]
    // Uzun notlar sayfa sayfa akar
    const perPage = Math.max(1, Math.floor((pageH - 20 - M) / 4))
    let i = 0
    while (i < lines.length) {
      const avail = Math.max(1, Math.floor((pageH - 20 - y) / 4))
      const chunk = lines.slice(i, i + Math.min(avail, perPage))
      if (chunk.length === 0 || (avail < 3 && i < lines.length)) { doc.addPage(); y = M; continue }
      doc.text(chunk, M, y); y += chunk.length * 4; i += chunk.length
    }
    doc.setTextColor(0)
  }

  // --- QR kod (WhatsApp / web sitesi) ---
  const qrTarget = settings.qrTarget === 'whatsapp' && settings.whatsappNumber ? `https://wa.me/${settings.whatsappNumber.replace(/[^\d]/g, '')}` : settings.qrTarget === 'website' && settings.websiteUrl ? settings.websiteUrl : null
  if (qrTarget) {
    try {
      const { toDataURL } = await import('qrcode')
      const dataUrl = await toDataURL(qrTarget, { margin: 0, width: 256, errorCorrectionLevel: 'M' })
      doc.setPage(1)
      doc.addImage(dataUrl, 'PNG', W - M - 18, pageH - 20 - 18, 18, 18)
      doc.setFontSize(6.5); doc.setTextColor(120)
      doc.text(settings.qrTarget === 'whatsapp' ? 'WhatsApp' : (settings.websiteUrl ?? '').replace(/^https?:\/\//, '').slice(0, 30), W - M - 9, pageH - 20 + 1.5, { align: 'center' })
      doc.setTextColor(0)
    } catch { /* qr başarısızsa sessizce geç */ }
  }

  // --- Altbilgi ---
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5); doc.setTextColor(130)
    doc.text(t('pdf.footer', { company: settings.companyName || t('pdf.defaultTitle'), no: quoteNo, basis: pricing.basis }), M, 290)
    doc.text(`${i} / ${pages}`, W - M, 290, { align: 'right' })
    doc.setTextColor(0)
  }
  return { doc, quoteNo }
}
