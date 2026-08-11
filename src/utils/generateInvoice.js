/**
 * generateInvoice.js — Genera PDF de presupuesto/factura.
 * jsPDF se carga dinámicamente para no engrosar el bundle principal.
 */
import { getConfig } from '../store/appConfig.js'

export async function generateInvoicePDF(opts) {
  const { jsPDF } = await import('jspdf')
  buildPDF(jsPDF, opts)
}

function buildPDF(jsPDF, {
  clientName, clientEmail, commissionTitle, artworkType,
  description, price, currency = 'USD', deadline, notes,
  paymentMethods = [], type = 'presupuesto',
}) {
  const config = getConfig()
  const studioName = config.projectName || 'Estudio de Comisiones'
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })

  const W = 210, margin = 20, contentW = W - margin * 2
  let y = margin

  const green = [34, 197, 94], dark = [13, 13, 18]
  const gray  = [136, 136, 150], light = [232, 232, 236]

  // Background
  doc.setFillColor(...dark); doc.rect(0, 0, W, 297, 'F')
  // Header bar
  doc.setFillColor(...green); doc.rect(0, 0, W, 2, 'F')

  // Studio name
  doc.setTextColor(...light); doc.setFontSize(20); doc.setFont('helvetica', 'bold')
  doc.text(studioName, margin, y + 10)

  // Doc type + number
  const docLabel = type === 'factura' ? 'FACTURA' : 'PRESUPUESTO'
  const docNum = `${docLabel}-${Date.now().toString().slice(-6)}`
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(...gray)
  doc.text(docNum, W - margin, y + 10, { align: 'right' })
  doc.text(new Date().toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' }), W - margin, y + 16, { align: 'right' })
  y += 28

  // Divider
  doc.setDrawColor(...green); doc.setLineWidth(0.5); doc.line(margin, y, W - margin, y); y += 8

  // Client
  doc.setTextColor(...gray); doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text('PARA', margin, y); y += 5
  doc.setTextColor(...light); doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text(clientName || '—', margin, y); y += 6
  if (clientEmail) {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...gray)
    doc.text(clientEmail, margin, y); y += 5
  }
  y += 6

  // Commission details box
  const boxH = artworkType ? 52 : 42
  doc.setFillColor(26, 26, 30); doc.roundedRect(margin, y, contentW, boxH, 3, 3, 'F')
  const innerX = margin + 8; let iy = y + 10
  doc.setTextColor(...gray); doc.setFontSize(8); doc.setFont('helvetica', 'bold')
  doc.text('DESCRIPCIÓN DEL SERVICIO', innerX, iy); iy += 6
  doc.setTextColor(...light); doc.setFontSize(11); doc.setFont('helvetica', 'bold')
  doc.text(commissionTitle || artworkType || 'Comisión artística', innerX, iy); iy += 6
  if (artworkType && commissionTitle) {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...gray)
    doc.text(artworkType, innerX, iy); iy += 6
  }
  if (description) {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 190)
    doc.text(doc.splitTextToSize(description, contentW - 16).slice(0, 2), innerX, iy)
  }
  y += boxH + 8

  // Price box
  doc.setFillColor(...green); doc.roundedRect(margin, y, contentW, 24, 3, 3, 'F')
  doc.setTextColor(0, 0, 0); doc.setFontSize(9); doc.setFont('helvetica', 'bold')
  doc.text('TOTAL A PAGAR', margin + 8, y + 8)
  doc.setFontSize(20)
  doc.text(`${price?.toFixed(2) ?? '—'} ${currency}`, W - margin - 8, y + 14, { align: 'right' })
  y += 30

  // Deadline
  if (deadline) {
    doc.setTextColor(...gray); doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.text(`Fecha límite: ${deadline}`, margin, y); y += 8
  }

  // Payment methods
  if (paymentMethods.length > 0) {
    y += 4
    const pmH = 14 + paymentMethods.length * 10
    doc.setFillColor(26, 26, 30); doc.roundedRect(margin, y, contentW, pmH, 3, 3, 'F')
    let py = y + 10
    doc.setTextColor(...gray); doc.setFontSize(8); doc.setFont('helvetica', 'bold')
    doc.text('MÉTODOS DE PAGO', margin + 8, py); py += 2
    paymentMethods.forEach(m => {
      py += 8
      doc.setTextColor(...light); doc.setFontSize(9); doc.setFont('helvetica', 'bold')
      doc.text(m.label || '', margin + 8, py)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 190)
      doc.text(m.value || '', margin + 40, py)
    })
    y += pmH + 8
  }

  // Notes
  if (notes) {
    y += 4
    doc.setTextColor(...gray); doc.setFontSize(8); doc.setFont('helvetica', 'bold')
    doc.text('NOTAS', margin, y); y += 5
    doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 190)
    const nl = doc.splitTextToSize(notes, contentW)
    doc.text(nl, margin, y); y += nl.length * 5 + 4
  }

  // Footer
  doc.setDrawColor(...green); doc.setLineWidth(0.3); doc.line(margin, 280, W - margin, 280)
  doc.setTextColor(...gray); doc.setFontSize(8); doc.setFont('helvetica', 'normal')
  doc.text(`${studioName} · Generado el ${new Date().toLocaleString('es')}`, W / 2, 286, { align: 'center' })

  const filename = `${docLabel.toLowerCase()}-${(clientName || 'cliente').toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString().slice(-6)}.pdf`
  doc.save(filename)
}
