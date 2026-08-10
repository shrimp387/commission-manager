/**
 * Menú del botón "+" — abre widgets inline dentro del panel de la comisión.
 * Cada widget se activa y queda visible en el panel hasta que se cierre.
 */
import React, { useState, useRef, useEffect } from 'react'

const WIDGETS = [
  { id: 'files',     icon: '📎', label: 'Subir archivo' },
  { id: 'embed',     icon: '🔗', label: 'Embed / Link' },
  { id: 'checklist', icon: '📋', label: 'Checklist' },
  { id: 'comments',  icon: '💬', label: 'Comentario' },
  { id: 'deadline',  icon: '📅', label: 'Fecha límite' },
  { id: 'assignee',  icon: '👤', label: 'Asignar a' },
  { id: 'timer',     icon: '⏱', label: 'Temporizador' },
  { id: 'reactions', icon: '😀', label: 'Reacción' },
]

export default function PlusWidgetMenu({ activeWidgets, onToggleWidget, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) { if (!ref.current?.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div className="plus-menu" ref={ref} role="menu" onClick={e => e.stopPropagation()}>
      <p className="plus-menu-label">Agregar a este panel</p>
      {WIDGETS.map(w => (
        <button
          key={w.id}
          className={`plus-menu-item ${activeWidgets.includes(w.id) ? 'plus-menu-item--active' : ''}`}
          role="menuitem"
          onClick={() => { onToggleWidget(w.id); onClose() }}
        >
          <span className="plus-menu-icon" aria-hidden="true">{w.icon}</span>
          {w.label}
          {activeWidgets.includes(w.id) && <span className="plus-menu-check">✓</span>}
        </button>
      ))}
    </div>
  )
}
