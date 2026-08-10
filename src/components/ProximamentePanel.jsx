import React from 'react'

export default function ProximamentePanel({ item, onDismiss }) {
  return (
    <div
      className="proximamente-panel"
      role="dialog"
      aria-modal="true"
      aria-label={item.label}
    >
      <div className="proximamente-panel-header">
        <span className="proximamente-panel-icon" aria-hidden="true">{item.icon}</span>
        <span className="proximamente-panel-title">{item.label}</span>
        <span className="proximamente-badge">Próximamente</span>
        <button
          className="proximamente-panel-close"
          onClick={onDismiss}
          aria-label="Cerrar panel"
          autoFocus
        >
          ×
        </button>
      </div>
      <p className="proximamente-panel-desc">{item.description}</p>
    </div>
  )
}
