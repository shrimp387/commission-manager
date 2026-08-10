/**
 * AcceptCommissionModal — shown when artist clicks "Aceptar solicitud"
 *
 * Lets the artist configure:
 *   - Final agreed price
 *   - Payment method(s): PayPal, Ko-fi, bank transfer, or custom
 *   - Optional personal note to the client
 *
 * On confirm: calls onAccept(paymentDetails) so the parent can
 * send the acceptance + payment emails and create the task.
 */
import React, { useState } from 'react'
import { isGmailConnected } from '../../utils/gmail.js'

const PAYMENT_PRESETS = [
  { id: 'paypal', label: 'PayPal', placeholder: 'https://paypal.me/tuusuario o correo PayPal', icon: '💳' },
  { id: 'kofi', label: 'Ko-fi', placeholder: 'https://ko-fi.com/tuusuario', icon: '☕' },
  { id: 'transfer', label: 'Transferencia bancaria', placeholder: 'Banco / CLABE / IBAN / datos de cuenta', icon: '🏦' },
  { id: 'custom', label: 'Otro método', placeholder: 'Instrucciones de pago...', icon: '💰' },
]

export default function AcceptCommissionModal({ request, onConfirm, onCancel }) {
  const [price, setPrice] = useState(
    request.budgetMin ? String(request.budgetMin) : ''
  )
  const [currency, setCurrency] = useState('USD')
  const [note, setNote] = useState('')
  const [methods, setMethods] = useState([
    { id: Date.now(), preset: 'paypal', value: '' },
  ])
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  function addMethod() {
    setMethods(m => [...m, { id: Date.now(), preset: 'paypal', value: '' }])
  }

  function removeMethod(id) {
    setMethods(m => m.filter(x => x.id !== id))
  }

  function updateMethod(id, field, value) {
    setMethods(m => m.map(x => x.id === id ? { ...x, [field]: value } : x))
  }

  function validate() {
    const e = {}
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      e.price = 'Ingresa el precio final acordado'
    }
    const filledMethods = methods.filter(m => m.value.trim())
    if (filledMethods.length === 0) {
      e.methods = 'Agrega al menos un método de pago con sus datos'
    }
    return e
  }

  async function handleConfirm() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSubmitting(true)

    const paymentDetails = {
      price: parseFloat(price),
      currency,
      note: note.trim(),
      methods: methods
        .filter(m => m.value.trim())
        .map(m => {
          const preset = PAYMENT_PRESETS.find(p => p.id === m.preset)
          return {
            label: preset?.label ?? m.preset,
            icon: preset?.icon ?? '💰',
            value: m.value.trim(),
          }
        }),
    }

    await onConfirm(paymentDetails)
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal-panel modal-panel--md">
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Aceptar comisión</h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
              Para: <strong>{request.name}</strong> ({request.email})
            </p>
          </div>
          <button className="modal-close" onClick={onCancel} aria-label="Cerrar">×</button>
        </div>

        <div className="modal-body">
          {/* Price */}
          <div className="form-group">
            <label className="form-label">Precio final acordado *</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>$</span>
              <input
                className={`form-input${errors.price ? ' error' : ''}`}
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={e => { setPrice(e.target.value); setErrors(v => ({ ...v, price: undefined })) }}
                placeholder="150.00"
                style={{ width: '140px' }}
              />
              <select
                className="form-input"
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                style={{ width: '90px' }}
              >
                <option>USD</option>
                <option>EUR</option>
                <option>MXN</option>
                <option>ARS</option>
                <option>COP</option>
              </select>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {request.budgetMin ? `(Cliente sugirió $${request.budgetMin}–${request.budgetMax || '?'})` : ''}
              </span>
            </div>
            {errors.price && <p className="form-error">{errors.price}</p>}
          </div>

          {/* Payment methods */}
          <div className="form-group">
            <label className="form-label">Métodos de pago *</label>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
              El cliente verá estos datos en el email de pago
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {methods.map((m, i) => {
                const preset = PAYMENT_PRESETS.find(p => p.id === m.preset) ?? PAYMENT_PRESETS[0]
                return (
                  <div key={m.id} style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start' }}>
                    <select
                      className="form-input"
                      value={m.preset}
                      onChange={e => updateMethod(m.id, 'preset', e.target.value)}
                      style={{ width: '165px', flexShrink: 0 }}
                    >
                      {PAYMENT_PRESETS.map(p => (
                        <option key={p.id} value={p.id}>{p.icon} {p.label}</option>
                      ))}
                    </select>
                    <input
                      className="form-input"
                      value={m.value}
                      onChange={e => updateMethod(m.id, 'value', e.target.value)}
                      placeholder={preset.placeholder}
                      style={{ flex: 1 }}
                    />
                    {methods.length > 1 && (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => removeMethod(m.id)}
                        aria-label="Eliminar método"
                        style={{ flexShrink: 0, padding: '0.35rem 0.5rem', color: 'var(--red)' }}
                      >×</button>
                    )}
                  </div>
                )
              })}
            </div>
            {errors.methods && <p className="form-error" style={{ marginTop: '0.3rem' }}>{errors.methods}</p>}

            <button
              type="button"
              className="btn-outline"
              onClick={addMethod}
              style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}
            >
              + Agregar otro método de pago
            </button>
          </div>

          {/* Personal note */}
          <div className="form-group">
            <label className="form-label">Nota personal para el cliente (opcional)</label>
            <textarea
              className="form-textarea"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Ej: ¡Hola! Muchas gracias por tu paciencia. Comenzaré el sketch esta semana..."
              rows={3}
            />
          </div>

          {/* Gmail status warning */}
          {!isGmailConnected() && (
            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-sm)', padding: '0.65rem 0.875rem', fontSize: '0.75rem', color: 'var(--orange)' }}>
              ⚠ <strong>Gmail no está conectado.</strong> La comisión quedará aceptada pero los emails NO se enviarán al cliente.
              Ve a <strong>Conexiones → Google</strong> y conecta tu cuenta para activar los envíos automáticos.
            </div>
          )}

          {/* Preview */}
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <p style={{ fontWeight: 700, color: 'var(--text)', marginBottom: '0.3rem' }}>📧 Se enviarán dos emails a {request.email}:</p>
            <p>1. <strong>Confirmación de aceptación</strong> — con detalles del encargo</p>
            <p>2. <strong>Instrucciones de pago</strong> — con el precio y métodos configurados</p>
          </div>        </div>

        <div className="modal-footer">
          <button className="btn-outline" onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? '⏳ Procesando...' : '✅ Confirmar aceptación y enviar emails'}
          </button>
        </div>
      </div>
    </div>
  )
}
