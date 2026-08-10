import React, { useState, useEffect } from 'react'
import { archiveTask } from '../store/archiveDb.js'

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

/**
 * Banner que aparece en tarjetas marcadas como completas.
 * Muestra un contador de 3 días con opciones: Archivar o Eliminar.
 */
export default function CompletionBanner({ task, fields, onArchive, onDelete, onReopen }) {
  const completedAt = fields.completedAt || Date.now()
  const deadline = completedAt + THREE_DAYS_MS
  const [remaining, setRemaining] = useState(deadline - Date.now())

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(deadline - Date.now())
    }, 60000) // update every minute
    return () => clearInterval(timer)
  }, [deadline])

  const days = Math.max(0, Math.floor(remaining / 86400000))
  const hours = Math.max(0, Math.floor((remaining % 86400000) / 3600000))
  const expired = remaining <= 0

  function handleArchive() {
    archiveTask(task, { ...fields, completedAt })
    onArchive(task.id)
  }

  function handleDelete() {
    if (confirm('¿Eliminar permanentemente esta comisión?')) {
      onDelete(task.id)
    }
  }

  return (
    <div className={`completion-banner ${expired ? 'completion-banner--expired' : ''}`}>
      <div className="completion-banner-header">
        <span className="completion-banner-icon">✅</span>
        <div>
          <p className="completion-banner-title">¡Comisión completada!</p>
          {!expired ? (
            <p className="completion-banner-timer">
              {days > 0 ? `${days}d ${hours}h` : `${hours}h`} para auto-eliminar
            </p>
          ) : (
            <p className="completion-banner-timer completion-banner-timer--expired">
              Plazo vencido — elige qué hacer
            </p>
          )}
        </div>
      </div>

      <div className="completion-banner-actions">
        <button className="completion-btn completion-btn--archive" onClick={handleArchive}>
          🗂 Archivar
        </button>
        <button className="completion-btn completion-btn--delete" onClick={handleDelete}>
          🗑 Eliminar
        </button>
        <button className="completion-btn completion-btn--reopen" onClick={() => onReopen(task.id)}>
          ↩ Reabrir
        </button>
      </div>
    </div>
  )
}
