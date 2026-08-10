import React, { useState, useRef } from 'react'
import { sendTelegramNotification } from '../../utils/telegram.js'
import { saveRequest } from '../../lib/db.js'

const STEP_LABELS = [
  'Información básica',
  'Descripción',
  'Referencias',
  'Detalles',
  'Confirmación',
]

const ARTWORK_TYPES = [
  'Retrato', 'Ilustración', 'Logo', 'Cómic',
  'Diseño de personaje', 'Referencia de hoja', 'Otro',
]

const STYLES = [
  'Realista', 'Anime', 'Cartoon', 'Semi-realista', 'Minimalista', 'Otro',
]

const FORMATS = ['PNG', 'JPG', 'PSD', 'PDF', 'SVG', 'WEBP']

function StepBar({ current, total }) {
  return (
    <div className="step-bar" role="progressbar" aria-valuenow={current} aria-valuemax={total}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`step-dot ${i < current ? 'done' : i === current - 1 ? 'active' : ''}`}
          aria-label={`Paso ${i + 1}${i < current - 1 ? ' completado' : i === current - 1 ? ' actual' : ''}`}
        />
      ))}
      <span className="step-label">Paso {current} de {total} — {STEP_LABELS[current - 1]}</span>
    </div>
  )
}

export default function CommissionForm({ onSubmit }) {
  const [step, setStep] = useState(1)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [requestId, setRequestId] = useState(null)

  const [form, setForm] = useState({
    // Step 1
    name: '', email: '', social: '',
    // Step 2
    artworkType: '', description: '', styles: [], usage: '',
    // Step 3
    images: [], imageUrls: '', refNotes: '',
    // Step 4
    size: '', formats: [], deadline: '', budgetMin: '', budgetMax: '', notes: '',
    // Step 5
    terms: false,
  })

  const fileInputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => ({ ...e, [field]: undefined }))
  }

  function toggleArray(field, value) {
    setForm(f => ({
      ...f,
      [field]: f[field].includes(value)
        ? f[field].filter(v => v !== value)
        : [...f[field], value],
    }))
  }

  function validate(s) {
    const e = {}
    if (s === 1) {
      if (!form.name.trim()) e.name = 'El nombre es requerido'
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
        e.email = 'Correo electrónico inválido'
    }
    if (s === 2) {
      if (!form.artworkType) e.artworkType = 'Selecciona un tipo de obra'
      if (form.description.trim().length < 10) e.description = 'Descripción muy corta (mín. 10 caracteres)'
      if (!form.usage) e.usage = 'Selecciona el uso final'
    }
    if (s === 5) {
      if (!form.terms) e.terms = 'Debes aceptar los términos y condiciones'
    }
    return e
  }

  function handleNext() {
    const e = validate(step)
    if (Object.keys(e).length) { setErrors(e); return }
    setStep(s => Math.min(s + 1, 5))
    setErrors({})
  }

  function handleFiles(files) {
    const remaining = 5 - form.images.length
    if (remaining <= 0) return
    const valid = Array.from(files).slice(0, remaining).filter(f =>
      ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(f.type)
    )
    const readers = valid.map(file => new Promise(resolve => {
      const r = new FileReader()
      r.onload = e => resolve({ name: file.name, url: e.target.result, file })
      r.readAsDataURL(file)
    }))
    Promise.all(readers).then(imgs => {
      update('images', [...form.images, ...imgs].slice(0, 5))
    })
  }

  async function handleSubmit(withPayment) {
    const e = validate(5)
    if (Object.keys(e).length) { setErrors(e); return }

    setSubmitting(true)
    const id = `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

    const request = {
      id,
      createdAt: new Date().toISOString(),
      status: 'pending',
      withPayment,
      ...form,
      images: form.images.map(i => ({ name: i.name, url: i.url })),
    }

    // Save to Supabase (primary) + localStorage (cache)
    await saveRequest(request)

    // Send Telegram notification
    await sendTelegramNotification(request)

    setRequestId(id)
    setSubmitted(true)
    setSubmitting(false)
  }

  if (submitted) {
    return (
      <div className="form-success">
        <div className="success-icon" aria-hidden="true">✅</div>
        <h2>¡Tu solicitud fue enviada con éxito!</h2>
        <p>Número de solicitud: <strong>{requestId}</strong></p>
        <p>Nos pondremos en contacto pronto a <strong>{form.email}</strong>.</p>
        <button className="btn-primary" onClick={() => {
          setSubmitted(false); setStep(1)
          setForm({ name:'',email:'',social:'',artworkType:'',description:'',styles:[],usage:'',images:[],imageUrls:'',refNotes:'',size:'',formats:[],deadline:'',budgetMin:'',budgetMax:'',notes:'',terms:false })
          onSubmit?.()
        }}>
          Ver solicitudes →
        </button>
      </div>
    )
  }

  return (
    <div className="commission-form">
      <StepBar current={step} total={5} />

      <div className="form-card">
        {/* STEP 1 */}
        {step === 1 && (
          <div className="form-step">
            <h2 className="form-step-title">Información básica</h2>
            <div className="form-group">
              <label className="form-label" htmlFor="cf-name">Nombre completo *</label>
              <input id="cf-name" className={`form-input ${errors.name ? 'error' : ''}`}
                value={form.name} onChange={e => update('name', e.target.value)}
                placeholder="Tu nombre" />
              {errors.name && <p className="form-error">{errors.name}</p>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cf-email">Correo electrónico *</label>
              <input id="cf-email" type="email" className={`form-input ${errors.email ? 'error' : ''}`}
                value={form.email} onChange={e => update('email', e.target.value)}
                placeholder="correo@ejemplo.com" />
              {errors.email && <p className="form-error">{errors.email}</p>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cf-social">Redes sociales (opcional)</label>
              <input id="cf-social" className="form-input"
                value={form.social} onChange={e => update('social', e.target.value)}
                placeholder="@usuario o link de perfil" />
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="form-step">
            <h2 className="form-step-title">Describe tu comisión</h2>
            <div className="form-group">
              <label className="form-label">Tipo de obra *</label>
              <div className="chip-grid">
                {ARTWORK_TYPES.map(t => (
                  <button
                    key={t}
                    type="button"
                    className={`chip ${form.artworkType === t ? 'chip--active' : ''}`}
                    onClick={() => update('artworkType', t)}
                    aria-pressed={form.artworkType === t}
                  >{t}</button>
                ))}
              </div>
              {errors.artworkType && <p className="form-error">{errors.artworkType}</p>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cf-desc">Descripción detallada *</label>
              <textarea id="cf-desc" className={`form-textarea ${errors.description ? 'error' : ''}`}
                value={form.description} onChange={e => update('description', e.target.value)}
                placeholder="Describe con detalle lo que quieres: personajes, escena, colores, estado de ánimo..."
                rows={5} />
              {errors.description && <p className="form-error">{errors.description}</p>}
            </div>
            <div className="form-group">
              <label className="form-label">Estilo preferido (opcional, múltiple)</label>
              <div className="chip-grid">
                {STYLES.map(s => (
                  <button key={s} type="button"
                    className={`chip ${form.styles.includes(s) ? 'chip--active' : ''}`}
                    onClick={() => toggleArray('styles', s)}
                    aria-pressed={form.styles.includes(s)}
                  >{s}</button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Uso final *</label>
              <div className="radio-group">
                {['Personal', 'Comercial'].map(u => (
                  <label key={u} className={`radio-option ${form.usage === u ? 'radio-option--active' : ''}`}>
                    <input type="radio" name="usage" value={u}
                      checked={form.usage === u} onChange={() => update('usage', u)} />
                    {u}
                  </label>
                ))}
              </div>
              {errors.usage && <p className="form-error">{errors.usage}</p>}
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div className="form-step">
            <h2 className="form-step-title">Referencias visuales</h2>
            <div className="form-group">
              <label className="form-label">
                Imágenes de referencia (máx. 5)
                <span className="form-label-count"> — {form.images.length}/5</span>
              </label>
              <div
                className={`drop-zone ${dragOver ? 'drop-zone--active' : ''} ${form.images.length >= 5 ? 'drop-zone--full' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
                onClick={() => form.images.length < 5 && fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Zona de carga de imágenes"
              >
                {form.images.length < 5 ? (
                  <>
                    <span className="drop-zone-icon" aria-hidden="true">🖼</span>
                    <p>Arrastra imágenes aquí o <strong>haz clic</strong> para seleccionar</p>
                    <p className="drop-zone-hint">PNG, JPG, WEBP, GIF — máx. 5 archivos</p>
                  </>
                ) : (
                  <p>Límite alcanzado (5/5)</p>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="sr-only"
                onChange={e => handleFiles(e.target.files)}
                aria-hidden="true"
              />

              {/* Thumbnails */}
              {form.images.length > 0 && (
                <div className="thumb-grid">
                  {form.images.map((img, i) => (
                    <div key={i} className="thumb-item">
                      <img src={img.url} alt={img.name} className="thumb-img" />
                      <button
                        className="thumb-remove"
                        onClick={() => update('images', form.images.filter((_, j) => j !== i))}
                        aria-label={`Eliminar imagen ${img.name}`}
                      >×</button>
                      <span className="thumb-label">{img.name.slice(0, 12)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="cf-urls">Pegar links de imágenes (opcional)</label>
              <textarea id="cf-urls" className="form-textarea"
                value={form.imageUrls} onChange={e => update('imageUrls', e.target.value)}
                placeholder="https://ejemplo.com/referencia.jpg&#10;Un link por línea"
                rows={3} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cf-refnotes">Notas sobre las referencias (opcional)</label>
              <textarea id="cf-refnotes" className="form-textarea"
                value={form.refNotes} onChange={e => update('refNotes', e.target.value)}
                placeholder="Explica qué te gusta o qué quieres evitar de estas referencias..."
                rows={3} />
            </div>
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div className="form-step">
            <h2 className="form-step-title">Detalles y presupuesto</h2>
            <div className="form-group">
              <label className="form-label" htmlFor="cf-size">Tamaño / Resolución (opcional)</label>
              <input id="cf-size" className="form-input"
                value={form.size} onChange={e => update('size', e.target.value)}
                placeholder="Ej: A4 a 300dpi, 2000x2000px, etc." />
            </div>
            <div className="form-group">
              <label className="form-label">Formato de entrega (múltiple)</label>
              <div className="chip-grid">
                {FORMATS.map(f => (
                  <button key={f} type="button"
                    className={`chip ${form.formats.includes(f) ? 'chip--active' : ''}`}
                    onClick={() => toggleArray('formats', f)}
                    aria-pressed={form.formats.includes(f)}
                  >{f}</button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cf-deadline">Fecha límite deseada (opcional)</label>
              <input id="cf-deadline" type="date" className="form-input"
                value={form.deadline} onChange={e => update('deadline', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Presupuesto estimado en USD (opcional)</label>
              <div className="budget-range">
                <div className="budget-field">
                  <label htmlFor="cf-budmin" className="budget-label">Mínimo</label>
                  <input id="cf-budmin" type="number" className="form-input form-input--sm"
                    value={form.budgetMin} onChange={e => update('budgetMin', e.target.value)}
                    placeholder="$50" min="0" />
                </div>
                <span className="budget-sep">—</span>
                <div className="budget-field">
                  <label htmlFor="cf-budmax" className="budget-label">Máximo</label>
                  <input id="cf-budmax" type="number" className="form-input form-input--sm"
                    value={form.budgetMax} onChange={e => update('budgetMax', e.target.value)}
                    placeholder="$200" min="0" />
                </div>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cf-notes">Notas adicionales (opcional)</label>
              <textarea id="cf-notes" className="form-textarea"
                value={form.notes} onChange={e => update('notes', e.target.value)}
                placeholder="Cualquier información adicional que quieras compartir..."
                rows={4} />
            </div>
          </div>
        )}

        {/* STEP 5 */}
        {step === 5 && (
          <div className="form-step">
            <h2 className="form-step-title">Resumen y confirmación</h2>
            <div className="summary-grid">
              <div className="summary-item"><span className="summary-key">Nombre</span><span>{form.name}</span></div>
              <div className="summary-item"><span className="summary-key">Correo</span><span>{form.email}</span></div>
              {form.social && <div className="summary-item"><span className="summary-key">Redes</span><span>{form.social}</span></div>}
              <div className="summary-item"><span className="summary-key">Tipo de obra</span><span>{form.artworkType}</span></div>
              <div className="summary-item"><span className="summary-key">Uso final</span><span>{form.usage}</span></div>
              {form.budgetMin && <div className="summary-item"><span className="summary-key">Presupuesto</span><span>${form.budgetMin} – ${form.budgetMax || '?'} USD</span></div>}
              {form.deadline && <div className="summary-item"><span className="summary-key">Fecha límite</span><span>{form.deadline}</span></div>}
              <div className="summary-item summary-item--full"><span className="summary-key">Descripción</span><span>{form.description}</span></div>
            </div>

            {form.images.length > 0 && (
              <div className="form-group">
                <p className="form-label">Referencias adjuntas</p>
                <div className="thumb-grid">
                  {form.images.map((img, i) => (
                    <div key={i} className="thumb-item">
                      <img src={img.url} alt={img.name} className="thumb-img" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <label className={`terms-label ${errors.terms ? 'terms-label--error' : ''}`}>
              <input
                type="checkbox"
                checked={form.terms}
                onChange={e => update('terms', e.target.checked)}
              />
              <span>Acepto los <a href="#" className="terms-link">términos y condiciones</a> de uso</span>
            </label>
            {errors.terms && <p className="form-error">{errors.terms}</p>}
          </div>
        )}

        {/* Navigation */}
        <div className="form-nav">
          {step > 1 && (
            <button className="btn-outline" onClick={() => setStep(s => s - 1)}>
              ← Anterior
            </button>
          )}
          <div className="form-nav-right">
            {step < 5 && (
              <button className="btn-primary" onClick={handleNext}>
                Siguiente →
              </button>
            )}
            {step === 5 && (
              <>
                <button
                  className="btn-outline"
                  onClick={() => handleSubmit(false)}
                  disabled={submitting}
                >
                  {submitting ? 'Enviando...' : 'Enviar sin pago (presupuesto por confirmar)'}
                </button>
                <button
                  className="btn-primary"
                  onClick={() => handleSubmit(true)}
                  disabled={submitting}
                >
                  {submitting ? 'Enviando...' : '💳 Pagar y enviar solicitud'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
