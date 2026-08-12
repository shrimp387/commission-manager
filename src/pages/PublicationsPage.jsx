import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadPublications } from '../lib/publicationsDb.js'
import { useTasks } from '../hooks/useTasks.js'

/**
 * Formatea una fecha ISO-8601 a DD/MM/YYYY HH:mm en la zona horaria local del navegador.
 */
function formatDate(isoString) {
  if (!isoString) return '—'
  try {
    const d = new Date(isoString)
    const pad = n => String(n).padStart(2, '0')
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return isoString
  }
}

const STATUS_LABELS = {
  queued:    { label: 'En cola',   cls: 'pub-badge--queued'    },
  published: { label: 'Publicado', cls: 'pub-badge--published' },
  error:     { label: 'Error',     cls: 'pub-badge--error'     },
}

export default function PublicationsPage() {
  const navigate = useNavigate()
  const { rawTasks } = useTasks()
  const [records, setRecords] = useState([])
  const [fromLocalStorage, setFromLocalStorage] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPublications().then(({ records: recs, fromLocalStorage: offline }) => {
      setRecords(recs)
      setFromLocalStorage(offline)
      setLoading(false)
    })
  }, [])

  // Build a Set of existing taskIds for O(1) lookup
  const existingTaskIds = new Set(rawTasks.map(t => t.id))

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-bg" aria-hidden="true" />
        <div className="page-header-content">
          <div className="page-header-brand">
            <div className="page-header-icon">📣</div>
            <div>
              <p className="page-header-eyebrow">PIPELINE</p>
              <h1 className="page-header-title">Publicaciones</h1>
              <p className="page-header-sub">Historial de obras enviadas a PostyBirb.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Offline banner */}
        {fromLocalStorage && (
          <div className="pub-offline-banner" role="alert">
            ⚠️ Mostrando datos locales — reconecta para sincronizar.
          </div>
        )}

        {loading ? (
          <div className="pub-loading">
            <div className="mini-spinner" />
          </div>
        ) : records.length === 0 ? (
          <div className="pub-empty">
            <p>Aún no has enviado ninguna publicación a PostyBirb.</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
              Cuando una comisión esté en stage "Entregado", aparecerá el botón 📢 Preparar publicación en la tarjeta Kanban.
            </p>
          </div>
        ) : (
          <div className="pub-list">
            {records.map(rec => {
              const taskExists = existingTaskIds.has(rec.taskId)
              const badge = STATUS_LABELS[rec.status] ?? { label: rec.status, cls: '' }

              return (
                <div key={rec.id} className="pub-card">
                  {/* Thumbnail */}
                  <div className="pub-thumb">
                    {rec.imageUrl ? (
                      <img
                        src={rec.imageUrl}
                        alt={rec.taskName}
                        onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                      />
                    ) : null}
                    <div
                      className="pub-thumb-placeholder"
                      style={{ display: rec.imageUrl ? 'none' : 'flex' }}
                      aria-hidden="true"
                    >
                      🖼
                    </div>
                  </div>

                  {/* Info */}
                  <div className="pub-info">
                    <div className="pub-info-top">
                      <span className="pub-name">{rec.taskName}</span>
                      <span className={`pub-badge ${badge.cls}`}>{badge.label}</span>
                    </div>

                    {/* Error message */}
                    {rec.status === 'error' && rec.errorMessage && (
                      <p className="pub-error-msg">⚠ {rec.errorMessage}</p>
                    )}

                    {/* Platforms */}
                    {rec.platforms?.length > 0 && (
                      <div className="pub-platforms">
                        {rec.platforms.map(p => (
                          <span key={p} className="pub-platform-chip">{p}</span>
                        ))}
                      </div>
                    )}

                    <p className="pub-date">📅 {formatDate(rec.sentAt)}</p>
                  </div>

                  {/* Navigate button */}
                  <button
                    className="pub-goto-btn"
                    disabled={!taskExists}
                    title={taskExists ? 'Ver comisión en el tablero' : 'La comisión ya no existe en el tablero.'}
                    onClick={() => taskExists && navigate('/studio')}
                    aria-label={taskExists ? `Ver comisión ${rec.taskName} en el tablero` : 'La comisión ya no existe en el tablero'}
                  >
                    {taskExists ? '↗ Ver' : '—'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
