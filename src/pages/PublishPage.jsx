/**
 * PublishPage.jsx — Página flotante multi-paso para publicar una comisión.
 *
 * Ruta: /#/publish/:taskId
 * Se superpone sobre toda la app como un overlay full-screen.
 *
 * Pasos:
 *   1. Vista previa    — imagen + título + descripción
 *   2. Tags            — Mistral genera automáticamente, editables
 *   3. Plataformas     — seleccionar dónde publicar
 *   4. Confirmar       — resumen + enviar job a companion app
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTaskStore } from '../store/taskStore.js'
import { identifyHighResAttachment, generateTags, normalizeTag, ConfigError } from '../lib/tagGenerator.js'
import { insertPublishJob } from '../lib/publishJobsDb.js'
import { getCurrentUserId } from '../lib/db.js'
import { getConfig, setConfig } from '../store/appConfig.js'
import ImageCropModal from '../components/ImageCropModal.jsx'

// ── Step bar (same pattern as CommissionForm) ────────────────────────────────

const STEPS = [
  { id: 1, label: 'Vista previa'  },
  { id: 2, label: 'Tags'          },
  { id: 3, label: 'Plataformas'   },
  { id: 4, label: 'Confirmar'     },
]

const COMPANION_PLATFORMS = [
  { id: 'e621',     label: 'e621',     icon: '🐾', desc: 'Arte furry/NSFW' },
  { id: 'inkbunny', label: 'Inkbunny', icon: '🐇', desc: 'Arte furry' },
  { id: 'weasyl',   label: 'Weasyl',   icon: '🦊', desc: 'Arte general' },
  { id: 'bluesky',  label: 'Bluesky',  icon: '🦋', desc: 'Red social' },
  { id: 'telegram', label: 'Telegram', icon: '✈️', desc: 'Canal/grupo' },
  { id: 'discord',  label: 'Discord',  icon: '🎮', desc: 'Webhook' },
]

function StepBar({ current, total }) {
  return (
    <div className="pub-step-bar">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`pub-step-dot ${i < current - 1 ? 'done' : i === current - 1 ? 'active' : ''}`}
        />
      ))}
      <span className="pub-step-label">
        Paso {current} de {total} — {STEPS[current - 1]?.label}
      </span>
    </div>
  )
}

// ── Tag chip ──────────────────────────────────────────────────────────────────

function TagChips({ tags, onRemove, onAdd, disabled }) {
  const [input, setInput] = useState('')
  const MAX = 200

  function handleAdd() {
    const norm = normalizeTag(input.trim())
    if (!norm || tags.includes(norm) || tags.length >= MAX) return
    onAdd(norm)
    setInput('')
  }

  return (
    <div className="pub-tags-area">
      <div className="pub-tag-chips">
        {tags.map(tag => (
          <span key={tag} className="pub-tag-chip">
            {tag}
            {!disabled && (
              <button
                className="pub-tag-remove"
                onClick={() => onRemove(tag)}
                aria-label={`Eliminar ${tag}`}
              >×</button>
            )}
          </span>
        ))}
      </div>
      {tags.length < MAX && !disabled && (
        <div className="pub-tag-input-row">
          <input
            className="pub-tag-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
            onBlur={handleAdd}
            placeholder="Agregar tag..."
          />
        </div>
      )}
      {tags.length >= MAX && (
        <p className="pub-tags-limit">Máximo 200 tags alcanzado.</p>
      )}
    </div>
  )
}

// ── Main PublishPage ──────────────────────────────────────────────────────────

export default function PublishPage() {
  const { taskId } = useParams()
  const navigate   = useNavigate()
  const { rawTasks, getFields } = useTaskStore()

  // Find task
  const task   = rawTasks?.find(t => t.id === taskId) ?? null
  const fields = getFields ? getFields(taskId) : {}

  // High-res image
  const highRes = identifyHighResAttachment(fields?.attachments ?? [])

  // ── Form state ──────────────────────────────────────────────────────────────
  const [step, setStep]               = useState(1)
  const [title, setTitle]             = useState(task?.text ?? '')
  const [desc, setDesc]               = useState('')
  const [rating, setRating]           = useState('safe')
  const [tags, setTags]               = useState([])
  const [selectedPlatforms, setSelectedPlatforms] = useState([])
  
  // ── Thumbnail/crop state ────────────────────────────────────────────────────
  const [showCropModal, setShowCropModal] = useState(false)
  const [thumbnailBlob, setThumbnailBlob] = useState(null)
  const [thumbnailPreview, setThumbnailPreview] = useState(null)

  // ── Loading / error state ───────────────────────────────────────────────────
  const [loadingTags,    setLoadingTags]    = useState(false)
  const [loadingStatus,  setLoadingStatus]  = useState(null)
  const [tagsError,      setTagsError]      = useState(null)
  const [sending,      setSending]      = useState(false)
  const [sendError,    setSendError]    = useState(null)
  const [sendSuccess,  setSendSuccess]  = useState(false)

  // ── Tag backend state ───────────────────────────────────────────────────────
  const [tagBackend, setTagBackendState] = useState(() => getConfig().tagBackend ?? 'e621')

  function handleBackendChange(val) {
    setTagBackendState(val)
    setConfig('tagBackend', val)
  }
  
  // ── Thumbnail/crop handlers ─────────────────────────────────────────────────
  function handleCropSave(blob) {
    setThumbnailBlob(blob)
    setThumbnailPreview(URL.createObjectURL(blob))
    setShowCropModal(false)
  }
  
  function handleRemoveThumbnail() {
    if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview)
    setThumbnailBlob(null)
    setThumbnailPreview(null)
  }

  // ── Auto-generate tags when entering step 2 ─────────────────────────────────
  // DISABLED — User can manually add tags or click "Regenerar" button
  // useEffect(() => {
  //   if (step !== 2 || !highRes || tags.length > 0) return
  //   generateTagsAuto()
  // }, [step])

  async function generateTagsAuto() {
    setLoadingTags(true)
    setTagsError(null)
    setLoadingStatus(null)
    
    try {
      const generated = await generateTags(highRes.url, tagBackend, (msg) => {
        // Show status messages from the tag generation process
        setTagsError(null)
        setLoadingStatus(msg)
      })
      setTags(generated)
      setLoadingStatus(null)
    } catch (err) {
      console.error('[PublishPage] generateTagsAuto error:', err)
      setLoadingStatus(null)
      
      if (err instanceof ConfigError) {
        setTagsError(err.message)
      } else if (err.message.includes('CORS')) {
        // CORS-specific error with helpful instructions
        setTagsError(
          `⚠️ CORS Error: ${err.message} ` +
          `Si acabas de configurar CORS en R2, espera 5 minutos y recarga la página en modo incógnito (Ctrl+Shift+N).`
        )
      } else {
        setTagsError(`Error: ${err.message}`)
      }
    } finally {
      setLoadingTags(false)
    }
  }

  function removeTag(tag)  { setTags(prev => prev.filter(t => t !== tag)) }
  function addTag(tag)     { setTags(prev => [...prev, tag]) }

  function togglePlatform(id) {
    setSelectedPlatforms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  // ── Navigation ───────────────────────────────────────────────────────────────
  function goNext() { setStep(s => Math.min(s + 1, 4)) }
  function goBack() {
    if (step === 1) navigate(-1)
    else setStep(s => s - 1)
  }

  function canNext() {
    if (step === 1) return title.trim().length > 0
    if (step === 2) return true // tags optional
    if (step === 3) return selectedPlatforms.length > 0
    return false
  }

  // ── Submit ────────────────────────────────────────────────────────────────────
  async function handlePublish() {
    setSending(true)
    setSendError(null)
    try {
      await insertPublishJob({
        taskId,
        taskName: task?.text ?? title,
        imageUrl: highRes?.url ?? '',
        platforms: selectedPlatforms,
        title: title.trim(),
        description: desc.trim(),
        tags,
        rating,
      })
      setSendSuccess(true)
      setTimeout(() => navigate(-1), 2500)
    } catch (err) {
      setSendError(err?.message || 'Error al enviar el job de publicación.')
    } finally {
      setSending(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="pub-overlay" role="dialog" aria-modal="true" aria-label="Preparar publicación">
      <div className="pub-panel">

        {/* ── Header ── */}
        <div className="pub-header">
          <button className="pub-back" onClick={goBack} aria-label="Volver">
            {step === 1 ? '✕' : '← Atrás'}
          </button>
          <h1 className="pub-title">📢 Preparar publicación</h1>
          <div className="pub-header-spacer" />
        </div>

        {/* ── Step bar ── */}
        <StepBar current={step} total={4} />

        {/* ══ STEP 1: Preview ══════════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="pub-step-content">
            <div className="pub-preview-section">
              {highRes ? (
                <>
                  <img
                    src={highRes.url}
                    alt="Vista previa"
                    className="pub-preview-img"
                  />
                  <div className="pub-thumbnail-controls">
                    <button
                      className="pub-btn-secondary"
                      onClick={() => setShowCropModal(true)}
                      style={{ fontSize: '0.85rem', padding: '8px 16px' }}
                    >
                      ✂️ Crear Thumbnail
                    </button>
                    {thumbnailPreview && (
                      <div className="pub-thumbnail-preview">
                        <img src={thumbnailPreview} alt="Thumbnail preview" />
                        <button
                          className="pub-thumbnail-remove"
                          onClick={handleRemoveThumbnail}
                          title="Eliminar thumbnail"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="pub-preview-placeholder">
                  <span style={{ fontSize: '3rem' }}>🖼</span>
                  <p>Sin imagen adjunta</p>
                  <p className="pub-hint">Adjunta la imagen final a la comisión antes de publicar.</p>
                </div>
              )}
            </div>

            <div className="pub-form-section">
              <div className="pub-field">
                <label className="pub-label">Título *</label>
                <input
                  className="pub-input"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Título de la publicación"
                />
              </div>

              <div className="pub-field">
                <label className="pub-label">Descripción <span className="pub-optional">(opcional)</span></label>
                <textarea
                  className="pub-textarea"
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  rows={4}
                  placeholder="Describe tu obra para las plataformas..."
                />
              </div>

              <div className="pub-field">
                <label className="pub-label">Rating</label>
                <div className="pub-rating-group">
                  {[
                    { value: 'safe',         label: '🟢 Safe',         desc: 'Apto para todos' },
                    { value: 'questionable', label: '🟡 Questionable',  desc: 'Contenido maduro' },
                    { value: 'explicit',     label: '🔴 Explicit',      desc: 'Contenido adulto' },
                  ].map(r => (
                    <label key={r.value} className={`pub-rating-option ${rating === r.value ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="rating"
                        value={r.value}
                        checked={rating === r.value}
                        onChange={() => setRating(r.value)}
                      />
                      <span className="pub-rating-label">{r.label}</span>
                      <span className="pub-rating-desc">{r.desc}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ STEP 2: Tags ═════════════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="pub-step-content">
            <div className="pub-tags-header">
              <div>
                <h2 className="pub-section-title">Tags e621</h2>
                <p className="pub-section-sub">
                  {loadingTags
                    ? 'Analizando imagen...'
                    : tags.length > 0
                    ? `${tags.length} tags`
                    : 'Agrega tags manualmente o genera con IA'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {/* Backend selector */}
                <select
                  className="pub-tag-input"
                  style={{ fontSize: '0.78rem', padding: '0.35rem 0.55rem', width: 'auto' }}
                  value={tagBackend}
                  onChange={e => handleBackendChange(e.target.value)}
                  title="Motor de generación de tags"
                >
                  <option value="e621">🐾 E621-Tagger (furry art, gratis)</option>
                  <option value="pawfect">🦊 P.A.W.F.E.C.T (FurAffinity, gratis)</option>
                  <option value="mistral">🧠 Mistral Pixtral</option>
                </select>
                <button
                  className="pub-regen-btn"
                  onClick={generateTagsAuto}
                  disabled={loadingTags || !highRes}
                >
                  {tags.length > 0 ? '🔄 Regenerar' : '✨ Generar con IA'}
                </button>
              </div>
            </div>

            {loadingTags && (
              <div className="pub-loading">
                <div className="mini-spinner" />
                <span>{loadingStatus || 'Analizando imagen...'}</span>
              </div>
            )}

            {tagsError && (
              <div className="pub-warn-box">
                <span>⚠️</span>
                <span>{tagsError}</span>
              </div>
            )}

            {!loadingTags && (
              <TagChips
                tags={tags}
                onRemove={removeTag}
                onAdd={addTag}
                disabled={false}
              />
            )}
          </div>
        )}

        {/* ══ STEP 3: Plataformas ══════════════════════════════════════════════ */}
        {step === 3 && (
          <div className="pub-step-content">
            <h2 className="pub-section-title">¿Dónde publicar?</h2>
            <p className="pub-section-sub">
              La companion app abrirá el navegador con todo pre-llenado para que confirmes en cada plataforma.
            </p>

            <div className="pub-platform-grid">
              {COMPANION_PLATFORMS.map(p => {
                const selected = selectedPlatforms.includes(p.id)
                return (
                  <button
                    key={p.id}
                    className={`pub-platform-card ${selected ? 'selected' : ''}`}
                    onClick={() => togglePlatform(p.id)}
                    type="button"
                  >
                    <span className="pub-platform-icon">{p.icon}</span>
                    <span className="pub-platform-name">{p.label}</span>
                    <span className="pub-platform-desc">{p.desc}</span>
                    {selected && <span className="pub-platform-check">✓</span>}
                  </button>
                )
              })}
            </div>

            {selectedPlatforms.length === 0 && (
              <p className="pub-hint" style={{ marginTop: '1rem', textAlign: 'center' }}>
                Selecciona al menos una plataforma para continuar.
              </p>
            )}
          </div>
        )}

        {/* ══ STEP 4: Confirmar ════════════════════════════════════════════════ */}
        {step === 4 && (
          <div className="pub-step-content">
            {sendSuccess ? (
              <div className="pub-success">
                <span style={{ fontSize: '3rem' }}>✅</span>
                <h2>¡Job enviado!</h2>
                <p>La companion app lo procesará automáticamente.</p>
                <p className="pub-hint">Cerrando...</p>
              </div>
            ) : (
              <>
                <h2 className="pub-section-title">Resumen</h2>

                {/* Image thumbnail */}
                {highRes && (
                  <div className="pub-confirm-row">
                    <img src={highRes.url} alt="preview" className="pub-confirm-thumb" />
                    <div>
                      <p className="pub-confirm-title">{title}</p>
                      {desc && <p className="pub-confirm-desc">{desc}</p>}
                      <span className={`pub-rating-badge pub-rating-${rating}`}>
                        {rating === 'safe' ? '🟢 Safe' : rating === 'questionable' ? '🟡 Questionable' : '🔴 Explicit'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Tags summary */}
                <div className="pub-confirm-section">
                  <span className="pub-confirm-label">Tags</span>
                  <span className="pub-confirm-value">{tags.length} tags</span>
                </div>

                {/* Platforms */}
                <div className="pub-confirm-section">
                  <span className="pub-confirm-label">Plataformas</span>
                  <div className="pub-confirm-platforms">
                    {selectedPlatforms.map(id => {
                      const p = COMPANION_PLATFORMS.find(x => x.id === id)
                      return (
                        <span key={id} className="pub-platform-pill">
                          {p?.icon} {p?.label}
                        </span>
                      )
                    })}
                  </div>
                </div>

                {/* How it works */}
                <div className="pub-info-box">
                  <p>🖥️ <strong>La companion app</strong> abrirá el navegador con todo pre-llenado para que confirmes en cada plataforma seleccionada.</p>
                </div>

                {sendError && (
                  <p className="pub-error">{sendError}</p>
                )}

                <button
                  className="pub-submit-btn"
                  onClick={handlePublish}
                  disabled={sending}
                >
                  {sending ? '⏳ Enviando...' : '📤 Enviar a companion app'}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Footer nav ── */}
        {step < 4 && !sendSuccess && (
          <div className="pub-footer">
            <button className="pub-btn-back" onClick={goBack}>
              {step === 1 ? 'Cancelar' : '← Atrás'}
            </button>
            <button
              className="pub-btn-next"
              onClick={goNext}
              disabled={!canNext()}
            >
              {step === 3 ? 'Revisar →' : 'Siguiente →'}
            </button>
          </div>
        )}

      </div>
      
      {/* ── Crop Modal ── */}
      {showCropModal && highRes && (
        <ImageCropModal
          imageUrl={highRes.url}
          onSave={handleCropSave}
          onCancel={() => setShowCropModal(false)}
        />
      )}
    </div>
  )
}
