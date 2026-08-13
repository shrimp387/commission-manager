import React, { useState, useEffect, useCallback } from 'react'
import { useTaskStore } from '../store/taskStore.js'
import { identifyHighResAttachment, generateTags, normalizeTag, ConfigError } from '../lib/tagGenerator.js'
import { getPostyBirbAccounts, createSubmission, updateSubmission, queueSubmission } from '../lib/postybirb.js'
import { publishToE621 } from '../lib/platforms/e621.js'
import { savePublication } from '../lib/publicationsDb.js'
import { insertPublishJob } from '../lib/publishJobsDb.js'
import { getCurrentUserId } from '../lib/db.js'
import { getConfig } from '../store/appConfig.js'

// ── Companion platform routing ─────────────────────────────────────────────────

/**
 * Platform IDs handled by the Electron companion app.
 * These map directly to the platform modules in companion-app/src/platforms/.
 * PostyBirb accounts use UUIDs; companion platforms use plain string IDs.
 */
export const COMPANION_PLATFORM_IDS = new Set([
  'e621', 'inkbunny', 'weasyl', 'bluesky', 'telegram', 'discord',
])

/**
 * Returns true if the given account ID is a companion-app platform.
 * Exported for property-based testing (Property 3).
 */
export function isCompanionPlatform(id) {
  return COMPANION_PLATFORM_IDS.has(id)
}

// ── Validation ─────────────────────────────────────────────────────────────────

/**
 * Validates publish inputs before sending to PostyBirb.
 * Exported for property-based testing (Property 7).
 * @returns {{ valid: boolean, message: string }}
 */
export function validatePublishInputs({ title, selectedAccounts, tags }) {
  if (!title || !title.trim()) {
    return { valid: false, message: 'El título no puede estar vacío.' }
  }
  if (!selectedAccounts || selectedAccounts.length === 0) {
    return { valid: false, message: 'Selecciona al menos una plataforma para publicar.' }
  }
  if (!tags || tags.length === 0) {
    return { valid: false, message: 'Agrega al menos un tag antes de publicar.' }
  }
  return { valid: true, message: '' }
}

// ── UUID helper ────────────────────────────────────────────────────────────────

function genUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// ── Step labels ────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'uploading',   label: '⬆ Subiendo imagen...' },
  { id: 'submitting',  label: '⚙ Configurando publicación...' },
  { id: 'queuing',     label: '📬 Encolando en PostyBirb...' },
]

// ── Tag chip input ─────────────────────────────────────────────────────────────

function TagInput({ tags, onChange, disabled: panelDisabled }) {
  const [input, setInput] = useState('')
  const MAX = 200

  function addTag() {
    const normalized = normalizeTag(input.trim())
    if (!normalized || tags.includes(normalized) || tags.length >= MAX) return
    onChange([...tags, normalized])
    setInput('')
  }

  function removeTag(tag) {
    onChange(tags.filter(t => t !== tag))
  }

  return (
    <div className="pp-tags-area">
      <div className="pp-tag-chips">
        {tags.map(tag => (
          <span key={tag} className="pp-tag-chip">
            {tag}
            <button
              className="pp-tag-remove"
              onClick={() => removeTag(tag)}
              disabled={panelDisabled}
              aria-label={`Eliminar tag ${tag}`}
            >×</button>
          </span>
        ))}
      </div>
      {tags.length >= MAX ? (
        <p className="pp-tags-limit">Has alcanzado el máximo de 200 tags.</p>
      ) : (
        <div className="pp-tag-input-row">
          <input
            className="pp-tag-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
            onBlur={addTag}
            placeholder="Agregar tag..."
            disabled={panelDisabled || tags.length >= MAX}
            aria-label="Agregar nuevo tag"
          />
        </div>
      )}
    </div>
  )
}

// ── Main PublishPanel ──────────────────────────────────────────────────────────

/**
 * PublishPanel — Modal overlay para publicar una comisión en PostyBirb.
 *
 * Props:
 *   taskId   — ID de la tarea
 *   task     — objeto tarea { text, ... }
 *   fields   — campos del taskStore { attachments, publishTags, ... }
 *   onClose  — callback para cerrar el panel
 */
export default function PublishPanel({ taskId, task, fields, onClose }) {
  const { updateField } = useTaskStore()

  // ── Form state ──────────────────────────────────────────────────────────────
  const [title, setTitle]       = useState(task?.text ?? '')
  const [desc, setDesc]         = useState('')
  const [tags, setTagsState]    = useState(fields?.publishTags ?? [])

  // ── Load state ──────────────────────────────────────────────────────────────
  const [loadingTags,  setLoadingTags]  = useState(true)
  const [loadingAccts, setLoadingAccts] = useState(true)
  const [tagsError,    setTagsError]    = useState(null)
  const [acctsError,   setAcctsError]   = useState(null)
  const [accounts,     setAccounts]     = useState([])
  const [selected,     setSelected]     = useState([])

  // ── Send state ──────────────────────────────────────────────────────────────
  const [sending,        setSending]        = useState(false)
  const [sendStep,       setSendStep]       = useState(null) // 'uploading'|'submitting'|'queuing'
  const [sendError,      setSendError]      = useState(null)
  const [sendSuccess,    setSendSuccess]    = useState(false)
  const [validationMsg,  setValidationMsg]  = useState(null)

  // ── High-res attachment ─────────────────────────────────────────────────────
  const highRes = identifyHighResAttachment(fields?.attachments ?? [])

  // ── On mount: load tags + accounts in parallel ──────────────────────────────
  useEffect(() => {
    let cancelled = false

    // Generate tags
    async function loadTags() {
      if (!highRes) {
        setTagsError('No hay imagen adjunta para analizar.')
        setLoadingTags(false)
        return
      }
      try {
        const generated = await generateTags(highRes.url)
        if (!cancelled) {
          setTagsState(generated)
          updateField(taskId, 'publishTags', generated)
          setTagsError(null)
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ConfigError) {
            setTagsError(err.message)
          } else {
            setTagsError('No se pudieron generar tags con Mistral. Puedes agregar tags manualmente.')
          }
        }
      } finally {
        if (!cancelled) setLoadingTags(false)
      }
    }

    // Load accounts: built-in e621, companion platforms, and PostyBirb accounts
    async function loadAccounts() {
      const builtIn = []

      // e621 direct (legacy built-in route) — available if credentials stored in appConfig
      const cfg = getConfig()
      if (cfg.e621Username && cfg.e621ApiKey) {
        builtIn.push({ id: '__e621__', website: 'e621', name: cfg.e621Username, builtin: true })
      }

      // Companion app platforms — always shown so the user can select them;
      // the companion app handles them asynchronously via publish_jobs in Supabase.
      // Skip e621 here since it's already covered by the __e621__ built-in above.
      const companionAccts = ['inkbunny', 'weasyl', 'bluesky', 'telegram', 'discord'].map(p => ({
        id: p,
        website: p,
        name: p,
        isCompanion: true,
      }))

      // PostyBirb accounts (optional — only if URL is configured)
      let postybirbAccts = []
      if (cfg.postybirbUrl) {
        try {
          postybirbAccts = await getPostyBirbAccounts()
        } catch {
          // PostyBirb unavailable — not fatal, companion + builtin still work
          if (!cancelled && builtIn.length === 0 && companionAccts.length === 0) {
            setAcctsError('No se pudo conectar con PostyBirb. Verifica la URL en Conexiones.')
          }
        }
      }

      if (!cancelled) {
        const all = [...builtIn, ...companionAccts, ...postybirbAccts]
        setAccounts(all)
        if (all.length === 0) {
          setAcctsError('No hay plataformas disponibles. Configura la companion app o PostyBirb en Conexiones.')
        } else {
          setAcctsError(null)
        }
        setLoadingAccts(false)
      }
    }

    loadTags()
    loadAccounts()

    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tag change handler — persists to store ──────────────────────────────────
  const handleTagsChange = useCallback((newTags) => {
    setTagsState(newTags)
    updateField(taskId, 'publishTags', newTags)
  }, [taskId, updateField])

  // ── Regenerate tags ─────────────────────────────────────────────────────────
  async function handleRegenerate() {
    if (!highRes) return
    setLoadingTags(true)
    setTagsError(null)
    try {
      const generated = await generateTags(highRes.url)
      setTagsState(generated)
      updateField(taskId, 'publishTags', generated)
    } catch (err) {
      setTagsError(err instanceof ConfigError ? err.message : 'No se pudieron generar tags con Mistral. Puedes agregar manualmente.')
    } finally {
      setLoadingTags(false)
    }
  }

  // ── Toggle platform account ─────────────────────────────────────────────────
  function toggleAccount(id) {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // ── Publish flow ────────────────────────────────────────────────────────────
  async function handlePublish() {
    setValidationMsg(null)
    setSendError(null)

    const validation = validatePublishInputs({ title, selectedAccounts: selected, tags })
    if (!validation.valid) {
      setValidationMsg(validation.message)
      return
    }

    setSending(true)

    try {
      // Step 1 — Download image from R2
      setSendStep('uploading')
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30_000)
      let blob
      try {
        const res = await fetch(highRes.url, { signal: controller.signal })
        clearTimeout(timeout)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        blob = await res.blob()
      } catch (err) {
        clearTimeout(timeout)
        throw new Error('Error al obtener la imagen desde el almacenamiento. Intenta de nuevo.')
      }

      // Step 2 — Route to platforms
      setSendStep('submitting')
      const fileName = highRes.name || 'artwork.png'

      // Separate accounts by route type
      const e621Selected       = selected.includes('__e621__')
      const companionSelected  = selected.filter(id => isCompanionPlatform(id))
      const postybirbSelected  = selected.filter(id => id !== '__e621__' && !isCompanionPlatform(id))

      const publishedPlatforms = []
      const errors = []

      // ── Route A: e621 direct (built-in) ────────────────────────────────
      if (e621Selected) {
        try {
          const result = await publishToE621({
            file: blob,
            fileName,
            tags,
            rating: 's', // safe by default — can be made configurable later
            description: desc.trim(),
            sources: [],
          })
          if (result.ok) {
            publishedPlatforms.push('e621')
          } else {
            errors.push(`e621: ${result.error}`)
          }
        } catch (err) {
          errors.push(`e621: ${err?.message || 'Error desconocido'}`)
        }
      }

      // ── Route B: companion app via publish_jobs in Supabase ─────────────
      if (companionSelected.length > 0) {
        console.log('[PublishPanel] 🚀 Enviando job a companion app:', {
          platforms: companionSelected,
          taskId,
          taskName: task?.text ?? '',
          imageUrl: highRes.url,
          title: title.trim(),
          tags: tags.length,
          userId: getCurrentUserId(),
        })
        setSendStep('queuing')
        try {
          const result = await insertPublishJob({
            taskId,
            taskName: task?.text ?? '',
            imageUrl: highRes.url,
            platforms: companionSelected,
            title: title.trim(),
            description: desc.trim(),
            tags,
            rating: 'safe',
          })
          console.log('[PublishPanel] ✅ Job creado en Supabase:', result.id)
          publishedPlatforms.push(...companionSelected)
        } catch (err) {
          console.error('[PublishPanel] ❌ Error al enviar job a companion:', {
            error: err,
            message: err?.message,
            code: err?.code,
            stack: err?.stack,
          })
          errors.push(`companion: ${err?.message || 'Error al enviar job'}`)
        }
      }

      // ── Route C: PostyBirb ──────────────────────────────────────────────
      if (postybirbSelected.length > 0) {
        const submissionId = await createSubmission(blob, fileName, title.trim(), desc.trim())
        await updateSubmission(submissionId, { tags, accountIds: postybirbSelected })

        setSendStep('queuing')
        await queueSubmission(submissionId)

        const pbNames = accounts
          .filter(a => postybirbSelected.includes(a.id))
          .map(a => a.website || a.name || a.id)
        publishedPlatforms.push(...pbNames)
      } else if (!companionSelected.length) {
        setSendStep('queuing')
      }

      // If ALL platforms failed, throw
      if (errors.length > 0 && publishedPlatforms.length === 0) {
        throw new Error(errors.join('\n'))
      }

      // Save record
      const record = {
        id: genUUID(),
        taskId,
        taskName: task?.text ?? '',
        imageUrl: highRes.url,
        platforms: publishedPlatforms,
        status: 'queued',
        errorMessage: errors.length > 0 ? errors.join('\n') : null,
        postybirbSubmissionId: '',
        sentAt: new Date().toISOString(),
        userId: getCurrentUserId() ?? '',
      }
      await savePublication(record)

      setSendSuccess(true)
      setTimeout(() => onClose(), 2000)
    } catch (err) {
      const msg = err?.message || 'Error desconocido al publicar.'
      setSendError(msg)

      // Save error record
      try {
        await savePublication({
          id: genUUID(),
          taskId,
          taskName: task?.text ?? '',
          imageUrl: highRes?.url ?? null,
          platforms: accounts.filter(a => selected.includes(a.id)).map(a => a.website || a.name || a.id),
          status: 'error',
          errorMessage: msg,
          postybirbSubmissionId: '',
          sentAt: new Date().toISOString(),
          userId: getCurrentUserId() ?? '',
        })
      } catch {}
    } finally {
      setSending(false)
      setSendStep(null)
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const canPublish = !sending && !acctsError && selected.length > 0 && title.trim() && tags.length > 0

  const currentStepLabel = sendStep ? (STEPS.find(s => s.id === sendStep)?.label ?? '') : ''

  return (
    <div
      className="pp-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Preparar publicación"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="pp-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="pp-header">
          <h2 className="pp-title">📢 Preparar publicación</h2>
          <button className="pp-close" onClick={onClose} aria-label="Cerrar panel">✕</button>
        </div>

        {sendSuccess ? (
          <div className="pp-success">
            <p className="pp-success-msg">✅ Obra enviada correctamente</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Cerrando...</p>
          </div>
        ) : (
          <div className="pp-body">
            {/* Left column — image preview (thumbnail, publishes full-res) */}
            <div className="pp-col-image">
              {highRes ? (
                <img
                  src={highRes.url}
                  alt="Vista previa"
                  className="pp-preview-img"
                  style={{
                    width: '100%',
                    maxHeight: '180px',
                    objectFit: 'contain',
                    borderRadius: '8px',
                    background: 'var(--bg-dark, #111)',
                  }}
                />
              ) : (
                <div className="pp-preview-placeholder">
                  <span>🖼</span>
                  <p>Sin imagen adjunta</p>
                </div>
              )}
            </div>

            {/* Right column — form */}
            <div className="pp-col-form">
              {/* Title */}
              <div className="pp-field">
                <label className="pp-label">Título</label>
                <input
                  className="pp-input"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  disabled={sending}
                  placeholder="Título de la publicación"
                />
              </div>

              {/* Description */}
              <div className="pp-field">
                <label className="pp-label">Descripción <span className="pp-optional">(opcional)</span></label>
                <textarea
                  className="pp-textarea"
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  disabled={sending}
                  rows={3}
                  placeholder="Descripción de la obra..."
                />
              </div>

              {/* Tags */}
              <div className="pp-field">
                <div className="pp-field-header">
                  <label className="pp-label">Tags e621 ({tags.length}/200)</label>
                  {highRes && !loadingTags && (
                    <button className="pp-regen-btn" onClick={handleRegenerate} disabled={sending}>
                      🔄 Regenerar
                    </button>
                  )}
                </div>
                {loadingTags ? (
                  <div className="pp-loading-row"><div className="mini-spinner" /><span>Generando tags con Mistral...</span></div>
                ) : tagsError ? (
                  <p className="pp-warn">{tagsError}</p>
                ) : null}
                <TagInput tags={tags} onChange={handleTagsChange} disabled={sending} />
              </div>

              {/* Platforms */}
              <div className="pp-field">
                <label className="pp-label">Plataformas</label>
                {loadingAccts ? (
                  <div className="pp-loading-row"><div className="mini-spinner" /><span>Cargando plataformas...</span></div>
                ) : acctsError ? (
                  <p className="pp-error">{acctsError}</p>
                ) : accounts.length === 0 ? (
                  <p className="pp-warn">No hay cuentas configuradas en PostyBirb.</p>
                ) : (
                  <div className="pp-accounts">
                    {accounts.map(acct => (
                      <label key={acct.id} className="pp-account-label">
                        <input
                          type="checkbox"
                          checked={selected.includes(acct.id)}
                          onChange={() => toggleAccount(acct.id)}
                          disabled={sending}
                        />
                        <span className="pp-account-name">{acct.website || acct.name}</span>
                        {acct.name && acct.website && (
                          <span className="pp-account-user">@{acct.name}</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Validation message */}
              {validationMsg && <p className="pp-validation">{validationMsg}</p>}

              {/* Send error */}
              {sendError && <p className="pp-error">{sendError}</p>}

              {/* Progress steps */}
              {sending && sendStep && (
                <div className="pp-progress">
                  <div className="mini-spinner" />
                  <span>{currentStepLabel}</span>
                </div>
              )}

              {/* Publish button */}
              <button
                className="pp-publish-btn"
                onClick={handlePublish}
                disabled={!canPublish}
                aria-label="Publicar ahora en PostyBirb"
              >
                {sending ? '⏳ Publicando...' : '📤 Publicar ahora'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
