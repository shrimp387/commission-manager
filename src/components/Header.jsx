import React from 'react'

export default function Header({ onReload, loading, onNewCommission }) {
  return (
    <header className="header">
      <div className="header-bg" aria-hidden="true" />
      <div className="header-content">
        <div className="header-brand">
          <div className="brand-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="14" fill="#EC4899" />
              <path d="M8 14 C8 10 11 7 14 7 C17 7 20 10 20 14 C20 17 18 19 16 20 L14 21 L12 20 C10 19 8 17 8 14Z"
                fill="white" opacity="0.9" />
              <circle cx="14" cy="14" r="3" fill="#EC4899" />
            </svg>
          </div>
          <div>
            <p className="brand-studio">ESTUDIO CREATIVO</p>
            <h1 className="brand-name">Estudio de Comisiones</h1>
            <p className="brand-tagline">De la idea a la entrega, con cada etapa visible y cada cliente acompañado.</p>
          </div>
        </div>

        <div className="header-actions">
          <button className="btn-assistant" aria-label="Abrir asistente">
            <span aria-hidden="true">✦</span> Abrir asistente
          </button>
          <button className="btn-theme" aria-label="Cambiar tema" title="Cambiar tema">
            ☀
          </button>
          <button className="btn-new" onClick={onNewCommission} aria-label="Nueva comisión">
            + Nueva comisión
          </button>
        </div>
      </div>
    </header>
  )
}
