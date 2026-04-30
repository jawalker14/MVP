import PDFDocument from 'pdfkit'
import { formatZAR } from '@invoicekasi/shared'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PdfLineItem {
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface PdfInvoiceData {
  invoice: {
    invoiceNumber: string
    type: string
    status: string
    subtotal: number
    vatRate: number
    vatAmount: number
    total: number
    dueDate: string | null
    notes: string | null
    paymentLinkUrl: string | null
    createdAt: Date | string | null
  }
  lineItems: PdfLineItem[]
  client: {
    name: string
    email: string | null
    phoneWhatsapp: string
  } | null
  business: {
    businessName: string
    addressLine1: string | null
    addressLine2: string | null
    city: string | null
    province: string | null
    postalCode: string | null
    vatNumber: string | null
    bankName: string | null
    bankAccountNumber: string | null
    bankBranchCode: string | null
  } | null
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const C = {
  primary:   '#1a1a2e',
  gold:      '#e8b931',
  secondary: '#64748b',
  headerBg:  '#f1f5f9',
  altRowBg:  '#f8fafc',
  border:    '#e2e8f0',
  paidGreen: '#27ae60',
  footer:    '#94a3b8',
  link:      '#3b82f6',
} as const

const PW = 595.28   // A4 width (pt)
const PH = 841.89   // A4 height (pt)
const M  = 50       // page margin
const CW = PW - M * 2  // content width (495.28)

// Table column widths
const CD = Math.round(CW * 0.55)     // Description  ~272
const CQ = 49                         // Qty
const CP = Math.round(CW * 0.175)    // Unit Price   ~87
const CT = CW - CD - CQ - CP         // Total        ~87.28

// Column X positions
const XD = M
const XQ = XD + CD
const XP = XQ + CQ
const XT = XP + CP

const ROW_H = 22       // minimum table row height
const PAGE_BOTTOM = PH - M - 80  // reserved for footer

// ─── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return ''
  // "YYYY-MM-DD" date-only strings — parse without timezone conversion
  if (typeof d === 'string') {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return `${m[3]} ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}`
  }
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return ''
  return `${String(date.getUTCDate()).padStart(2,'0')} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

function hLine(
  doc: PDFKit.PDFDocument,
  y: number,
  x1: number = M,
  x2: number = PW - M,
  color: string = C.border,
  weight: number = 0.5,
): void {
  doc.save()
  doc.moveTo(x1, y).lineTo(x2, y)
  doc.strokeColor(color).lineWidth(weight).stroke()
  doc.restore()
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export async function generateInvoicePDF(data: PdfInvoiceData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const { invoice, lineItems, client, business } = data

    const doc = new PDFDocument({ size: 'A4', margin: M, autoFirstPage: true, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Helper: draw table column headers at given y
    function drawTableHeader(headerY: number): void {
      doc.rect(M, headerY, CW, ROW_H).fill(C.headerBg)
      doc.font('Helvetica-Bold').fontSize(9).fillColor(C.primary)
      doc.text('Description', XD + 4, headerY + 7, { width: CD - 8,  lineBreak: false })
      doc.text('Qty',         XQ,     headerY + 7, { width: CQ,      align: 'right', lineBreak: false })
      doc.text('Unit Price',  XP,     headerY + 7, { width: CP,      align: 'right', lineBreak: false })
      doc.text('Total',       XT,     headerY + 7, { width: CT,      align: 'right', lineBreak: false })
    }

    // ── PAID WATERMARK (drawn first, behind all content) ──────────────────────
    if (invoice.status === 'paid') {
      doc.save()
      doc.rotate(-45, { origin: [PW / 2, PH / 2] })
      doc.font('Helvetica-Bold').fontSize(120)
      doc.fillColor(C.paidGreen, 0.15)
      doc.text('PAID', PW / 2 - 140, PH / 2 - 50, {
        width: 280,
        align: 'center',
        lineBreak: false,
      })
      doc.restore()
    }

    // ── HEADER ────────────────────────────────────────────────────────────────
    // Two columns: left = business info, right = invoice label + details

    const rightColX = M + 280   // right column starts at x=330
    const rightColW = PW - M - rightColX  // ~215pt

    let leftY  = M
    let rightY = M

    // Left: business name (wrapping) + address + VAT
    doc.font('Helvetica-Bold').fontSize(20).fillColor(C.primary)
    const bizName = business?.businessName || 'Your Business'
    const bizNameH = doc.heightOfString(bizName, { width: 270 })
    doc.text(bizName, M, leftY, { width: 270 })
    leftY += bizNameH + 6

    doc.font('Helvetica').fontSize(10).fillColor(C.secondary)
    if (business?.addressLine1) {
      doc.text(business.addressLine1, M, leftY, { width: 270, lineBreak: false })
      leftY += 14
    }
    if (business?.addressLine2) {
      doc.text(business.addressLine2, M, leftY, { width: 270, lineBreak: false })
      leftY += 14
    }
    const cityLine = [business?.city, business?.province, business?.postalCode]
      .filter(Boolean)
      .join(', ')
    if (cityLine) {
      doc.text(cityLine, M, leftY, { width: 270, lineBreak: false })
      leftY += 14
    }
    if (business?.vatNumber) {
      doc.fontSize(9)
      doc.text(`VAT No: ${business.vatNumber}`, M, leftY, { width: 270, lineBreak: false })
      leftY += 13
    }

    // Right: INVOICE/QUOTE label, number, dates
    doc.font('Helvetica-Bold').fontSize(28).fillColor(C.gold)
    doc.text(invoice.type === 'quote' ? 'QUOTE' : 'INVOICE', rightColX, rightY, {
      width: rightColW,
      align: 'right',
      lineBreak: false,
    })
    rightY += 36

    doc.font('Helvetica').fontSize(12).fillColor(C.secondary)
    doc.text(`# ${invoice.invoiceNumber}`, rightColX, rightY, {
      width: rightColW,
      align: 'right',
      lineBreak: false,
    })
    rightY += 18

    doc.fontSize(10)
    doc.text(`Date: ${fmtDate(invoice.createdAt)}`, rightColX, rightY, {
      width: rightColW,
      align: 'right',
      lineBreak: false,
    })
    rightY += 14

    if (invoice.dueDate) {
      doc.text(`Due: ${fmtDate(invoice.dueDate)}`, rightColX, rightY, {
        width: rightColW,
        align: 'right',
        lineBreak: false,
      })
      rightY += 14
    }

    let y = Math.max(leftY, rightY) + 18

    // ── SEPARATOR ─────────────────────────────────────────────────────────────
    hLine(doc, y, M, PW - M, C.border, 0.75)
    y += 16

    // ── BILL TO ───────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.secondary)
    doc.text('BILL TO', M, y, { lineBreak: false })
    y += 14

    if (client) {
      doc.font('Helvetica-Bold').fontSize(14).fillColor(C.primary)
      const clientNameH = doc.heightOfString(client.name, { width: 280 })
      doc.text(client.name, M, y, { width: 280 })
      y += clientNameH + 6

      doc.font('Helvetica').fontSize(10).fillColor(C.secondary)
      if (client.email) {
        doc.text(client.email, M, y, { lineBreak: false })
        y += 14
      }
      doc.text(client.phoneWhatsapp, M, y, { lineBreak: false })
      y += 14
    }

    y += 16

    // ── LINE ITEMS TABLE ──────────────────────────────────────────────────────
    drawTableHeader(y)
    y += ROW_H

    // Data rows — variable height based on wrapped description
    lineItems.forEach((item, i) => {
      doc.font('Helvetica').fontSize(9).fillColor(C.primary)
      const descHeight = doc.heightOfString(item.description, { width: CD - 8 })
      const rowHeight = Math.max(ROW_H, descHeight + 14)

      if (y + rowHeight > PAGE_BOTTOM) {
        doc.addPage()
        y = M
        drawTableHeader(y)
        y += ROW_H
      }

      if (i % 2 === 1) {
        doc.rect(M, y, CW, rowHeight).fill(C.altRowBg)
      }
      hLine(doc, y + rowHeight)

      doc.font('Helvetica').fontSize(9).fillColor(C.primary)
      doc.text(item.description,           XD + 4, y + 7, { width: CD - 8 })
      doc.text(fmtQty(item.quantity),      XQ,     y + 7, { width: CQ,     align: 'right', lineBreak: false })
      doc.text(formatZAR(item.unitPrice),  XP,     y + 7, { width: CP,     align: 'right', lineBreak: false })
      doc.text(formatZAR(item.lineTotal),  XT,     y + 7, { width: CT,     align: 'right', lineBreak: false })
      y += rowHeight
    })

    y += 22

    // ── TOTALS ────────────────────────────────────────────────────────────────
    let totalsH = 16 + 8 + 24 + 20  // subtotal + separator gap + total + bottom spacing
    if (invoice.vatRate > 0) totalsH += 16
    if (invoice.paymentLinkUrl) totalsH += 14

    if (y + totalsH > PAGE_BOTTOM) {
      doc.addPage()
      y = M
    }

    const tlX = 340           // totals label x
    const tlW = 100           // totals label width
    const tvX = tlX + tlW    // totals value x (440)
    const tvW = PW - M - tvX // totals value width (~105)

    doc.font('Helvetica').fontSize(10).fillColor(C.secondary)
    doc.text('Subtotal', tlX, y, { width: tlW, lineBreak: false })
    doc.text(formatZAR(invoice.subtotal), tvX, y, { width: tvW, align: 'right', lineBreak: false })
    y += 16

    if (invoice.vatRate > 0) {
      const vatPct = Number.isInteger(invoice.vatRate)
        ? String(invoice.vatRate)
        : invoice.vatRate.toFixed(2)
      doc.text(`VAT (${vatPct}%)`, tlX, y, { width: tlW, lineBreak: false })
      doc.text(formatZAR(invoice.vatAmount), tvX, y, { width: tvW, align: 'right', lineBreak: false })
      y += 16
    }

    hLine(doc, y, tlX, PW - M, C.secondary, 0.5)
    y += 8

    doc.font('Helvetica-Bold').fontSize(14).fillColor(C.primary)
    doc.text('Total', tlX, y, { width: tlW, lineBreak: false })
    doc.text(formatZAR(invoice.total), tvX, y, { width: tvW, align: 'right', lineBreak: false })
    y += 24

    if (invoice.paymentLinkUrl) {
      doc.font('Helvetica').fontSize(9).fillColor(C.link)
      doc.text(`Pay online: ${invoice.paymentLinkUrl}`, tlX, y, {
        width: tvX + tvW - tlX,
        lineBreak: false,
      })
      y += 14
    }

    y += 20

    // ── NOTES ─────────────────────────────────────────────────────────────────
    if (invoice.notes) {
      doc.font('Helvetica').fontSize(10).fillColor(C.secondary)
      const notesH = doc.heightOfString(invoice.notes, { width: CW })
      const notesSectionH = 14 + notesH + 20

      if (y + notesSectionH > PAGE_BOTTOM) {
        doc.addPage()
        y = M
      }

      doc.font('Helvetica-Bold').fontSize(10).fillColor(C.primary)
      doc.text('Notes', M, y, { lineBreak: false })
      y += 14

      doc.font('Helvetica').fontSize(10).fillColor(C.secondary)
      doc.text(invoice.notes, M, y, { width: CW })
      y += notesH + 20
    }

    // ── BANK DETAILS ──────────────────────────────────────────────────────────
    const hasBankDetails =
      business?.bankName || business?.bankAccountNumber || business?.bankBranchCode
    if (hasBankDetails) {
      let bankH = 14  // heading
      if (business?.bankName) bankH += 14
      if (business?.bankAccountNumber) bankH += 14
      if (business?.bankBranchCode) bankH += 14

      if (y + bankH > PAGE_BOTTOM) {
        doc.addPage()
        y = M
      }

      doc.font('Helvetica-Bold').fontSize(10).fillColor(C.primary)
      doc.text('Banking Details', M, y, { lineBreak: false })
      y += 14

      doc.font('Helvetica').fontSize(10).fillColor(C.secondary)
      if (business?.bankName) {
        doc.text(`Bank: ${business.bankName}`, M, y, { lineBreak: false })
        y += 14
      }
      if (business?.bankAccountNumber) {
        doc.text(`Account: ${business.bankAccountNumber}`, M, y, { lineBreak: false })
        y += 14
      }
      if (business?.bankBranchCode) {
        doc.text(`Branch Code: ${business.bankBranchCode}`, M, y, { lineBreak: false })
      }
    }

    // ── FOOTER — every page: gold line + branding + page numbers ─────────────
    const range = doc.bufferedPageRange()
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i)
      const footerY = PH - M - 22
      hLine(doc, footerY, M, PW - M, C.gold, 1.5)
      doc.font('Helvetica').fontSize(8).fillColor(C.footer)
      doc.text('Created with InvoiceKasi — invoicekasi.co.za', M, footerY + 7, {
        width: CW,
        align: 'center',
        lineBreak: false,
      })
      doc.text(`Page ${i + 1} of ${range.count}`, M, footerY + 7, {
        width: CW,
        align: 'right',
        lineBreak: false,
      })
    }

    doc.end()
  })
}