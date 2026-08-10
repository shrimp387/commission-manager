import React, { useState, useRef } from 'react'
import { SECTION_IDS, PRIORITY_OPTIONS, STAGE_OPTIONS } from '../config.js'

const FIXED_SECTIONS = [
  { id: SECTION_IDS.BACKLOG, label: '📋 Backlog y Proyectos' },
  { id: SECTION_IDS.NEW, label: '🎨 Comisiones Nuevas' },
  { id: SECTION_IDS.IN_PROGRESS, label: '🖌️ En Proceso' },
  { id: SECTION_IDS.IN_REVIEW, label: '👀 En Revisión' },
]

function getCustomSections() {
  try { return JSON.parse(localStorage.getItem('kanban_custom_sections') || '[]') }
  catch { return [] }
}

const STEPS = ['Básico', 'Detalles', 'Imagen', 'Confirmar']

function StepBar({ current, total, labels }) {
  return (
    <div className="nc-stepbar">
      {labels.map((label, i) => (
        <div key={i} className={`nc-step ${i < current ? 'done' : i === current ? 'active' : ''}`}>
          <div className="nc-step-dot">{i < current ? '✓' : i + 1}</div>
          <span className="nc-step-label">{label}</span>
          {i < total - 1 && <div className={`nc-step-line ${i < current ? 'done' : ''}`} />}
        </div>
      ))}
    </div>
  )
}

export default function NewCommissionModal({ sections, onAdd, onClose }) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  // Step 0 — Básico
  const [text, setText] = useState('')
  const [sectionId, setSectionId] = useState(SECTION_IDS.NEW)
  const [client, setClient] = useState('')
  const [priority, setPriority] = useState('ok')

  // Step 1 — Detalles
  const [stage, setStage] = useState('new')
  const [deadline, setDeadline] = useState('')
  const [assignee, setAssignee] = useState('')
  const [notes, setNotes] = useState('')

  // Step 2 — Imagen
  const [images, setImages] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef(null)

  const allSections = [...FIXED_SECTIONS, ...getCustomSections().map(cs => ({ id: cs.id, label: cs.label }))]

  function handleFiles(files) {
    const remaining = 3 - images.length
    const valid = Array.from(files).slice(0, remaining).filter(f => f.type.startsWith('image/'))
    const readers = valid.map(file => new Promise(resolve => {
      const r = new FileReader()
      r.onload = e => resolve({ name: file.name, url: e.target.result })
      r.readAsDataURL(file)
    }))
    Promise.all(readers).then(imgs => setImages(prev => [...prev, ...imgs].slice(0, 3)))
  }

  function canNext() {
    if (step === 0) return text.trim().length > 0
    return true
  }

  async function handleCreate() {
    if (!text.trim()) return
    setSaving(true)
    try {
      await onAdd(text.trim(), sectionId, {
        client, priority, stage, deadline, assignee, notes, images,
      })
      onClose()
    } catch {
      setSaving(false)
    }
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nc-title"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-panel" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2 id="nc-title" className="modal-title">Nueva comisión</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <div style={{ padding: '1rem 1.25rem 0' }}>
          <StepBar current={step} total={STEPS.length} labels={STEPS} />
        </div>

        <div className="modal-body" style={{ paddingTop: '1rem' }}>

          {/* ── PASO 0: BÁSICO ── */}
          {step === 0 && (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="nc-name">Nombre de la comisión *</label>
                <input
                  id="nc-name"
                  className="form-input"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Ej: Retrato de mascota - Cliente"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="nc-client">Cliente</label>
                <input
                  id="nc-client"
                  className="form-input"
                  value={client}
                  onChange={e => setClient(e.target.value)}
                  placeholder="Nombre del cliente"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="nc-section">Sección</label>
                <select
                  id="nc-section"
                  className="form-select"
                  value={sectionId}
                  onChange={e => setSectionId(e.target.value)}
                >
                  {allSections.map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Prioridad</label>
                <div className="nc-chip-row">
                  {Object.values(PRIORITY_OPTIONS).map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className={`nc-priority-chip ${priority === p.id ? 'active' : ''}`}
                      style={{ '--chip-color': p.color }}
                      onClick={() => setPriority(p.id)}
                      aria-pressed={priority === p.id}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── PASO 1: DETALLES ── */}
          {step === 1 && (
            <>
              <div className="form-group">
                <label className="form-label">Etapa inicial</label>
                <div className="nc-chip-row nc-chip-row--wrap">
                  {Object.values(STAGE_OPTIONS).map(s => (
                    <button
                      key={s.id}
                      type="button"
                      className={`nc-priority-chip ${stage === s.id ? 'active' : ''}`}
                      style={{ '--chip-color': s.color }}
                      onClick={() => setStage(s.id)}
                      aria-pressed={stage === s.id}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="nc-deadline">Fecha límite</label>
                <input
                  id="nc-deadline"
                  type="date"
                  className="form-input"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="nc-assignee">Asignar a</label>
                <input
                  id="nc-assignee"
                  className="form-input"
                  value={assignee}
                  onChange={e => setAssignee(e.target.value)}
                  placeholder="Nombre del artista o colaborador"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="nc-notes">Notas iniciales</label>
                <textarea
                  id="nc-notes"
                  className="form-textarea"
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Descripción breve, instrucciones especiales..."
                />
              </div>
            </>
          )}

          {/* ── PASO 2: IMAGEN ── */}
          {step === 2 && (
            <>
              <div className="form-group">
                <label className="form-label">
                  Imagen de referencia <span style={{ color: 'var(--text-dim)' }}>(máx. 3, opcional)</span>
                </label>
                <div
                  className={`drop-zone ${dragOver ? 'drop-zone--active' : ''} ${images.length >= 3 ? 'drop-zone--full' : ''}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
                  onClick={() => images.length < 3 && fileRef.current?.click()}
                  role="button" tabIndex={0}
                  aria-label="Zona de carga"
                >
                  {images.length < 3 ? (
                    <>
                      <span className="drop-zone-icon" aria-hidden="true">🖼</span>
                      <p>Arrastra o <strong>haz clic</strong> para seleccionar</p>
                      <p className="drop-zone-hint">PNG, JPG, WEBP — máx. 3</p>
                    </>
                  ) : (
                    <p>Límite alcanzado (3/3)</p>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={e => handleFiles(e.target.files)}
                />
                {images.length > 0 && (
                  <div className="thumb-grid" style={{ marginTop: '0.75rem' }}>
                    {images.map((img, i) => (
                      <div key={i} className="thumb-item">
                        <img src={img.url} alt={img.name} className="thumb-img" />
                        <button
                          className="thumb-remove"
                          onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                          aria-label={`Eliminar ${img.name}`}
                        >×</button>
                        <span className="thumb-label">{img.name.slice(0, 12)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── PASO 3: CONFIRMAR ── */}
          {step === 3 && (
            <div className="nc-summary">
              <div className="nc-summary-grid">
                <SummaryRow label="Nombre" value={text} />
                {client && <SummaryRow label="Cliente" value={client} />}
                <SummaryRow label="Sección" value={allSections.find(s => s.id === sectionId)?.label ?? sectionId} />
                <SummaryRow label="Prioridad" value={PRIORITY_OPTIONS[priority]?.name} />
                <SummaryRow label="Etapa" value={STAGE_OPTIONS[stage]?.name} />
                {deadline && <SummaryRow label="Fecha límite" value={deadline} />}
                {assignee && <SummaryRow label="Asignado a" value={assignee} />}
                {notes && <SummaryRow label="Notas" value={notes} full />}
              </div>
              {images.length > 0 && (
                <div>
                  <p className="form-label" style={{ marginBottom: '0.5rem' }}>Referencias</p>
                  <div className="thumb-grid">
                    {images.map((img, i) => (
                      <div key={i} className="thumb-item">
                        <img src={img.url} alt={img.name} className="thumb-img" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="modal-footer">
          {step > 0 ? (
            <button className="btn-outline" onClick={() => setStep(s => s - 1)}>← Anterior</button>
          ) : (
            <button className="btn-outline" onClick={onClose}>Cancelar</button>
          )}
          {step < STEPS.length - 1 ? (
            <button className="btn-primary" onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
              Siguiente →
            </button>
          ) : (
            <button className="btn-primary" onClick={handleCreate} disabled={!text.trim() || saving}>
              {saving ? 'Creando...' : '✓ Crear comisión'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ label, value, full }) {
  if (!value) return null
  return (
    <div className={`nc-summary-item ${full ? 'nc-summary-item--full' : ''}`}>
      <span className="nc-summary-key">{label}</span>
      <span className="nc-summary-val">{value}</span>
    </div>
  )
}
