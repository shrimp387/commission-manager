import React, { useState, useEffect } from 'react'
import { createTask } from '../../api/taskade.js'
import { SECTION_IDS } from '../../config.js'
import {
  isGmailConnected,
  sendCommissionAcceptedEmail,
  sendCommissionRejectedEmail,
  sendPaymentEmail,
} from '../../utils/gmail.js'
import { getConfig } from '../../store/appConfig.js'
import { setTaskField } from '../../store/taskStore.js'
import AcceptCommissionModal from './AcceptCommissionModal.jsx'
import { getRequests, saveRequest } from '../../lib/db.js'
import { findOrCreateClientFromRequest } from '../../lib/clientsDb.js'
import { generateInvoicePDF } from '../../utils/generateInvoice.js'
import InvoiceGenerator from '../InvoiceGenerator.jsx'

const STATUS_COLORS = {
  pending: '#F59E0B',
  accepted: '#22C55E',
  rejected: '#EF4444',
}
const STATUS_LABELS = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
}

export default function RequestsList() {
  const [requests, setRequests] = useState([])
  const [selected, setSelected] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)
  const [emailStatus, setEmailStatus] = useState(null) // { ok, msg }
  const [showAcceptModal, setShowAcceptModal] = useState(false)
  const [pendingAcceptReq, setPendingAcceptReq] = useState(null)
  const [showInvoice, setShowInvoice] = useState(false)
  const [invoiceReq, setInvoiceReq] = useState(null)

  // Re-check Gmail connection dynamically (user might connect after component mounts)
  const [gmailActive, setGmailActive] = useState(isGmailConnected())
  useEffect(() => {
    setGmailActive(isGmailConnected())
    // Recheck on focus (user returns from OAuth flow)
    const onFocus = () => setGmailActive(isGmailConnected())
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  useEffect(() => {
    // Load from Supabase first, fallback to localStorage
    getRequests().then(data => {
      if (data && data.length > 0) setRequests(data)
      else setRequests(JSON.parse(localStorage.getItem('commission_requests') || '[]'))
    }).catch(() => {
      setRequests(JSON.parse(localStorage.getItem('commission_requests') || '[]'))
    })
  }, [])

  async function saveRequests(updated) {
    setRequests(updated)
    // Save each changed item to Supabase + localStorage
    for (const req of updated) {
      await saveRequest(req)
    }
  }

  async function handleAccept(req) {
    // Show the payment modal first
    setPendingAcceptReq(req)
    setShowAcceptModal(true)
  }

  async function handleAcceptConfirm(paymentDetails) {
    const req = pendingAcceptReq
    setShowAcceptModal(false)
    setPendingAcceptReq(null)
    setProcessing(true)
    setError(null)
    setEmailStatus(null)

    try {
      // Create the task in the kanban board
      const taskId = await createTask(
        `${req.artworkType} — ${req.name}`,
        SECTION_IDS.NEW
      )

      // Store client info on the task so delivery email can be sent from the card
      if (taskId) {
        setTaskField(taskId, 'clientEmail', req.email)
        setTaskField(taskId, 'clientName', req.name)
        setTaskField(taskId, 'commissionRequestId', req.id)
        setTaskField(taskId, 'paymentDetails', paymentDetails)
      }

      // Create/update client record automatically
      const reqWithPayment = { ...req, paymentDetails }
      findOrCreateClientFromRequest(reqWithPayment).catch(() => {})

      const updated = requests.map(r =>
        r.id === req.id ? { ...r, status: 'accepted', paymentDetails } : r
      )
      saveRequests(updated)
      setSelected(updated.find(r => r.id === req.id))

      // Send emails — always attempt, report result clearly
      const currentGmailActive = isGmailConnected()
      if (currentGmailActive) {
        const cfg = getConfig()
        const emailResults = []

        try {
          await sendCommissionAcceptedEmail(req, cfg.projectName)
          emailResults.push('✅ Confirmación enviada')
        } catch (e) {
          emailResults.push(`⚠ Confirmación falló: ${e.message}`)
        }

        try {
          await sendPaymentEmail(req, paymentDetails, cfg.projectName)
          emailResults.push('💳 Instrucciones de pago enviadas')
        } catch (e) {
          emailResults.push(`⚠ Email de pago falló: ${e.message}`)
        }

        setEmailStatus({ ok: true, msg: `📧 ${emailResults.join(' · ')} → ${req.email}` })
        setGmailActive(true)
      } else {
        setEmailStatus({
          ok: false,
          msg: '⚠ Gmail no está conectado — comisión aceptada pero no se enviaron emails. Ve a Conexiones para conectar Google.'
        })
      }
    } catch (err) {
      setError(`Error al procesar: ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }

  async function handleReject(req) {
    setEmailStatus(null)
    const updated = requests.map(r =>
      r.id === req.id
        ? { ...r, status: 'rejected', rejectReason: rejectReason.trim() || undefined }
        : r
    )
    saveRequests(updated)
    setSelected(updated.find(r => r.id === req.id))
    setShowRejectInput(false)
    setRejectReason('')

    // Send rejection email if Gmail is connected
    if (gmailActive) {
      try {
        const cfg = getConfig()
        await sendCommissionRejectedEmail(req, rejectReason.trim(), cfg.projectName)
        setEmailStatus({ ok: true, msg: `📧 Email enviado a ${req.email}` })
      } catch (emailErr) {
        setEmailStatus({ ok: false, msg: `Rechazado, pero el email falló: ${emailErr.message}` })
      }
    }
  }

  // Metrics
  const total = requests.length
  const pending = requests.filter(r => r.status === 'pending').length
  const accepted = requests.filter(r => r.status === 'accepted').length
  const rejected = requests.filter(r => r.status === 'rejected').length

  return (
    <div className="requests-page">
      {/* Metrics */}
      <div className="requests-metrics">
        <div className="metric-pill"><span className="metric-num">{total}</span><span>Total</span></div>
        <div className="metric-pill metric-pill--warning"><span className="metric-num">{pending}</span><span>Pendientes</span></div>
        <div className="metric-pill metric-pill--success"><span className="metric-num">{accepted}</span><span>Aceptadas</span></div>
        <div className="metric-pill metric-pill--danger"><span className="metric-num">{rejected}</span><span>Rechazadas</span></div>
        {gmailActive ? (
          <div className="metric-pill" style={{ color: 'var(--green)', borderColor: 'rgba(34,197,94,0.25)' }}>
            <span style={{ fontSize: '0.85rem' }}>📧</span>
            <span>Emails automáticos activos</span>
          </div>
        ) : (
          <div className="metric-pill" style={{ color: 'var(--orange)', borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.06)' }}>
            <span style={{ fontSize: '0.85rem' }}>⚠</span>
            <span>Gmail no conectado — los emails no se enviarán</span>
          </div>
        )}
      </div>

      <div className="requests-layout">
        {/* List */}
        <div className="requests-list">
          {requests.length === 0 ? (
            <div className="requests-empty">
              <p>📭 No hay solicitudes aún.</p>
              <p className="requests-empty-hint">Las solicitudes enviadas por clientes aparecerán aquí.</p>
            </div>
          ) : (
            requests.map(req => (
              <button
                key={req.id}
                className={`request-row ${selected?.id === req.id ? 'request-row--active' : ''}`}
                onClick={() => { setSelected(req); setShowRejectInput(false); setError(null); setEmailStatus(null) }}
              >
                <div className="request-row-main">
                  <strong className="request-name">{req.name}</strong>
                  <span
                    className="request-badge"
                    style={{ color: STATUS_COLORS[req.status], borderColor: STATUS_COLORS[req.status] }}
                  >
                    {STATUS_LABELS[req.status]}
                  </span>
                </div>
                <div className="request-row-meta">
                  <span>{req.email}</span>
                  <span>·</span>
                  <span>{req.artworkType}</span>
                  <span>·</span>
                  <span>{new Date(req.createdAt).toLocaleDateString('es')}</span>
                </div>
                {req.budgetMin && (
                  <div className="request-budget">${req.budgetMin}–${req.budgetMax || '?'} USD</div>
                )}
              </button>
            ))
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="request-detail">
            <div className="detail-header">
              <h3 className="detail-title">{selected.name}</h3>
              <span
                className="request-badge request-badge--lg"
                style={{ color: STATUS_COLORS[selected.status], borderColor: STATUS_COLORS[selected.status] }}
              >
                {STATUS_LABELS[selected.status]}
              </span>
            </div>

            <div className="detail-grid">
              <div className="detail-field"><label>Correo</label><span>{selected.email}</span></div>
              {selected.social && <div className="detail-field"><label>Redes</label><span>{selected.social}</span></div>}
              <div className="detail-field"><label>Tipo de obra</label><span>{selected.artworkType}</span></div>
              <div className="detail-field"><label>Uso final</label><span>{selected.usage}</span></div>
              {selected.deadline && <div className="detail-field"><label>Fecha límite</label><span>{selected.deadline}</span></div>}
              {selected.budgetMin && <div className="detail-field"><label>Presupuesto</label><span>${selected.budgetMin}–${selected.budgetMax || '?'} USD</span></div>}
              {selected.formats?.length > 0 && <div className="detail-field"><label>Formatos</label><span>{selected.formats.join(', ')}</span></div>}
              {selected.styles?.length > 0 && <div className="detail-field"><label>Estilos</label><span>{selected.styles.join(', ')}</span></div>}
              <div className="detail-field detail-field--full"><label>Descripción</label><p>{selected.description}</p></div>
              {selected.refNotes && <div className="detail-field detail-field--full"><label>Notas de referencias</label><p>{selected.refNotes}</p></div>}
              {selected.notes && <div className="detail-field detail-field--full"><label>Notas adicionales</label><p>{selected.notes}</p></div>}
              {selected.rejectReason && <div className="detail-field detail-field--full"><label>Motivo de rechazo</label><p className="reject-reason">{selected.rejectReason}</p></div>}
            </div>

            {/* Reference images */}
            {selected.images?.length > 0 && (
              <div className="detail-refs">
                <label className="form-label">Referencias adjuntas</label>
                <div className="thumb-grid">
                  {selected.images.map((img, i) => (
                    <div key={i} className="thumb-item">
                      <img src={img.url} alt={img.name} className="thumb-img" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="form-error">{error}</p>}
            {emailStatus && (
              <p className={`test-result ${emailStatus.ok ? 'test-result--ok' : 'test-result--err'}`}>
                {emailStatus.msg}
              </p>
            )}

            {/* Actions */}
            <div className="detail-actions">
              {selected.status === 'accepted' && selected.paymentDetails && (
                <button
                  className="btn-outline"
                  onClick={() => generateInvoicePDF({
                    clientName: selected.name,
                    clientEmail: selected.email,
                    commissionTitle: `${selected.artworkType} — ${selected.name}`,
                    artworkType: selected.artworkType,
                    description: selected.description,
                    price: selected.paymentDetails.price,
                    currency: selected.paymentDetails.currency ?? 'USD',
                    deadline: selected.deadline,
                    notes: selected.paymentDetails.note,
                    paymentMethods: selected.paymentDetails.methods ?? [],
                    type: 'presupuesto',
                  })}
                  style={{ fontSize: '0.82rem' }}
                >
                  📄 Descargar presupuesto PDF
                </button>
              )}
              {selected.status === 'pending' && (
                <button
                  className="btn-primary"
                  onClick={() => handleAccept(selected)}
                  disabled={processing}
                >
                  {processing ? '⏳ Procesando...' : '✅ Aceptar solicitud'}
                </button>
              )}
              {(selected.status === 'pending' || selected.status === 'accepted') && (
                <>
                  {!showRejectInput ? (
                    <button
                      className="btn-danger"
                      onClick={() => setShowRejectInput(true)}
                    >
                      ❌ Rechazar solicitud
                    </button>
                  ) : (
                    <div className="reject-form">
                      <textarea
                        className="form-textarea"
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        placeholder="Motivo del rechazo (opcional)..."
                        rows={2}
                      />
                      <div className="reject-btns">
                        <button className="btn-danger" onClick={() => handleReject(selected)}>
                          Confirmar rechazo
                        </button>
                        <button className="btn-ghost" onClick={() => setShowRejectInput(false)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Accept commission modal — per-commission payment config */}
      {showAcceptModal && pendingAcceptReq && (
        <AcceptCommissionModal
          request={pendingAcceptReq}
          onConfirm={handleAcceptConfirm}
          onCancel={() => { setShowAcceptModal(false); setPendingAcceptReq(null) }}
        />
      )}
    </div>
  )
}