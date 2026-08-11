/**
 * InvoiceGenerator — genera presupuestos y facturas en PDF.
 *
 * Usa el sistema de impresión nativo del browser (window.print) con
 * una hoja de estilos especial para PDF. Sin dependencias externas.
 *
 * Props:
 *   request — la solicitud de comisión (o tarea con datos de cliente)
 *   paymentDetails — { price, currency, methods, note }
 *   type — 'quote' | 'invoice'
 *   onClose — función para cerrar el modal
 */
import React, { useRef, useState } from 'react'
import { getConfig } from '../store/appConfig.js'
import { sendGmail } from '../utils/gmail.js'
import { isGmailConnected } from '../utils/gmail.js'

function generateInvoiceNumber() {
  const d = new Date()
  return `INV-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${Math.floor(Math.random() * 900 + 100)}`
}

function buildInvoiceHTML({ config, request, paymentDetails, type, invoiceNumber, issueDate, dueDate }) {
  const isInvoice = type === 'invoice'
  const title = isInvoice ? 'FACTURA' : 'PRESUPUESTO'
  const price = paymentDetails?.price ?? 0
  const currency = paymentDetails?.currency ?? 'USD'
  const methods = paymentDetails?.methods ?? []
  const note = paymentDetails?.note ?? ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>${title} ${invoiceNumber}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; background: #fff; padding: 40px; font-size: 13px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 2px solid #22C55E; }
  .studio-name { font-size: 22px; font-weight: 800; color: #111; }
  .studio-sub { font-size: 12px; color: #666; margin-top: 4px; }
  .doc-type { text-align: right; }
  .doc-type-label { font-size: 28px; font-weight: 900; color: #22C55E; letter-spacing: -0.03em; }
  .doc-number { font-size: 12px; color: #888; margin-top: 4px; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 28px; }
  .meta-block h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 6px; }
  .meta-block p { font-size: 13px; color: #111; line-height: 1.6; }
  .table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  .table th { background: #f5f5f5; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #666; padding: 10px 12px; text-align: left; border-bottom: 1px solid #e0e0e0; }
  .table td { padding: 12px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  .table tr:last-child td { border-bottom: none; }
  .total-row { display: flex; justify-content: flex-end; margin-bottom: 24px; }
  .total-box { background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px 24px; text-align: right; min-width: 200px; }
  .total-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
  .total-value { font-size: 28px; font-weight: 900; color: #22C55E; }
  .payment-section { margin-bottom: 24px; }
  .payment-section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #888; margin-bottom: 12px; }
  .payment-method { background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px 16px; margin-bottom: 8px; }
  .payment-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; margin-bottom: 2px; }
  .payment-value { font-size: 13px; color: #111; }
  .note-box { background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 12px 16px; margin-bottom: 24px; font-size: 12px; color: #166534; }
  .footer { border-top: 1px solid #e0e0e0; padding-top: 16px; font-size: 11px; color: #999; text-align: center; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="studio-name">${config.projectIcon || '🎨'} ${config.projectName || 'Estudio de Comisiones'}</div>
    <div class="studio-sub">${config.projectSubtitle || ''}</div>
  </div>
  <div class="doc-type">
    <div class="doc-type-label">${title}</div>
    <div class="doc-number"># ${invoiceNumber}</div>
  </div>
</div>

<div class="meta">
  <div class="meta-block">
    <h3>Para</h3>
    <p><strong>${request.name}</strong></p>
    ${request.email ? `<p>${request.email}</p>` : ''}
    ${request.social ? `<p>${request.social}</p>` : ''}
  </div>
  <div class="meta-block" style="text-align:right">
    <h3>Fecha de emisión</h3>
    <p>${issueDate}</p>
    ${isInvoice && dueDate ? `<br/><h3>Fecha de vencimiento</h3><p>${dueDate}</p>` : ''}
  </div>
</div>

<table class="table">
  <thead>
    <tr>
      <th>Descripción</th>
      <th style="text-align:right">Cantidad</th>
      <th style="text-align:right">Precio</th>
      <th style="text-align:right">Total</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <strong>${request.artworkType || 'Comisión artística'}</strong>
        ${request.description ? `<br/><span style="color:#666;font-size:12px">${request.description.slice(0, 120)}${request.description.length > 120 ? '...' : ''}</span>` : ''}
      </td>
      <td style="text-align:right">1</td>
      <td style="text-align:right">${price.toFixed(2)} ${currency}</td>
      <td style="text-align:right"><strong>${price.toFixed(2)} ${currency}</strong></td>
    </tr>
  </tbody>
</table>

<div class="total-row">
  <div class="total-box">
    <div class="total-label">Total a pagar</div>
    <div class="total-value">${price.toFixed(2)} <span style="font-size:16px;color:#888">${currency}</span></div>
  </div>
</div>

${methods.length > 0 ? `
<div class="payment-section">
  <h3>Métodos de pago</h3>
  ${methods.map(m => `
    <div class="payment-method">
      <div class="payment-label">${m.icon || ''} ${m.label}</div>
      <div class="payment-value">${m.value}</div>
    </div>
  `).join('')}
</div>
` : ''}

${note ? `<div class="note-box">💬 <strong>Nota:</strong> ${note}</div>` : ''}

<div class="footer">
  ${config.projectName || 'Estudio de Comisiones'} · ${title} generada el ${issueDate} · ID: ${invoiceNumber}
</div>
</body>
</html>`
}

export default function InvoiceGenerator({ request, paymentDetails, onClose }) {
  const config = getConfig()
  const [type, setType] = useState('quote')
  const [invoiceNumber] = useState(generateInvoiceNumber)
  const [sending, setSending] = useState(false)
  const [sendStatus, setSendStatus] = useState(null)
  const iframeRef = useRef(null)

  const issueDate = new Date().toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })
  const dueDate = new Date(Date.now() + 7 * 86400000).toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })

  const html = buildInvoiceHTML({ config, request, paymentDetails, type, invoiceNumber, issueDate, dueDate })

  function handlePrint() {
    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 500)
  }

  async function handleSendEmail() {
    if (!isGmailConnected()) {
      setSendStatus({ ok: false, msg: 'Gmail no está conectado. Ve a Conexiones para activarlo.' })
      return
    }
    setSending(true)
    setSendStatus(null)
    try {
      const subject = type === 'invoice'
        ? `Factura ${invoiceNumber} — ${request.artworkType || 'Comisión'}`
        : `Presupuesto ${invoiceNumber} — ${request.artworkType || 'Comisión'}`
      await sendGmail({ to: request.email, subject, htmlBody: html })
      setSendStatus({ ok: true, msg: `Enviado a ${request.email}` })
    } catch (e) {
      setSendStatus({ ok: false, msg: e.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel modal-panel--lg" style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <h2 className="modal-title">Generar documento</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Type selector */}
          <div className="form-group">
            <label className="form-label">Tipo de documento</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[{ id: 'quote', label: '📄 Presupuesto' }, { id: 'invoice', label: '🧾 Factura' }].map(t => (
                <button
                  key={t.id}
                  className={type === t.id ? 'btn-primary' : 'btn-outline'}
                  onClick={() => setType(t.id)}
                  style={{ flex: 1 }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', height: 340, marginBottom: '1rem' }}>
            <iframe
              ref={iframeRef}
              srcDoc={html}
              style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
              title="Vista previa del documento"
            />
          </div>

          {/* Info row */}
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            <span>Para: <strong style={{ color: 'var(--text)' }}>{request.name}</strong></span>
            <span>N°: <strong style={{ color: 'var(--text)' }}>{invoiceNumber}</strong></span>
            <span>Total: <strong style={{ color: 'var(--green)' }}>${(paymentDetails?.price ?? 0).toFixed(2)} {paymentDetails?.currency}</strong></span>
          </div>

          {sendStatus && (
            <p className={`test-result ${sendStatus.ok ? 'test-result--ok' : 'test-result--err'}`} style={{ marginBottom: '0.5rem' }}>
              {sendStatus.ok ? '✅' : '❌'} {sendStatus.msg}
            </p>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>Cerrar</button>
          <button className="btn-outline" onClick={handlePrint}>
            🖨 Descargar / Imprimir PDF
          </button>
          {request.email && (
            <button className="btn-primary" onClick={handleSendEmail} disabled={sending}>
              {sending ? '⏳ Enviando...' : `📧 Enviar a ${request.email}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
