import React, { useState } from 'react'
import { useConfig } from '../hooks/useConfig.js'
import { useResizableSidebar } from '../hooks/useResizableSidebar.js'
import ResizeHandle from './ResizeHandle.jsx'
import ProximamentePanel from './ProximamentePanel.jsx'

const NAV_ITEMS = [
  { id: 'studio', icon: '🔭', label: 'Estudio de Comisiones' },
  { id: 'requests', icon: '📋', label: 'Solicitudes de Comisión' },
  { id: 'archived', icon: '🗂', label: 'Archivados' },
  { id: 'portfolio', icon: '🖼', label: 'Galería de Portafolio' },
  { id: 'guide', icon: '📖', label: 'Guía del Estudio' },
]

const PLACEHOLDER_ITEMS = [
  { icon: '🤖', label: 'Agentes de IA', description: 'Conecta agentes autónomos para automatizar tareas de tu estudio.' },
  { icon: '⚡', label: 'Automatizaciones', description: 'Crea flujos de trabajo automáticos basados en eventos del proyecto.' },
  { icon: '🧬', label: 'Mapa DNA', description: 'Visualiza la estructura y dependencias de todo tu estudio creativo.' },
]

export default function Sidebar({ active, onNavigate, mobileOpen, onMobileClose }) {
  const config = useConfig()
  const { handleMouseDown, handleDoubleClick } = useResizableSidebar()
  const [activePanel, setActivePanel] = useState(null)
  return (
    <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`} aria-label="Navegación principal">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon" aria-hidden="true">{config.projectIcon || '🎨'}</div>
        <div>
          <p className="sidebar-brand-name">{config.projectName || 'Estudio Creativo'}</p>
          <p className="sidebar-brand-sub">Comisiones</p>
        </div>
        <button className="sidebar-close-mobile" onClick={onMobileClose} aria-label="Cerrar menú">×</button>
      </div>

      {/* Search */}
      <div className="sidebar-search">
        <span className="sidebar-search-icon" aria-hidden="true">🔍</span>
        <input
          className="sidebar-search-input"
          placeholder="Buscar..."
          aria-label="Buscar en el workspace"
          readOnly
        />
        <kbd className="sidebar-search-kbd">Ctrl K</kbd>
      </div>

      {/* Projects */}
      <nav className="sidebar-nav" aria-label="Proyectos">
        <p className="sidebar-section-label">Proyectos</p>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`sidebar-item ${active === item.id ? 'sidebar-item--active' : ''}`}
            onClick={() => onNavigate(item.id)}
            aria-current={active === item.id ? 'page' : undefined}
          >
            <span className="sidebar-item-icon" aria-hidden="true">{item.icon}</span>
            <span className="sidebar-item-label">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Connections + Placeholders */}
      <nav className="sidebar-nav sidebar-nav--placeholders" aria-label="Funciones adicionales">
        {/* Connections — active */}
        <button
          className={`sidebar-item sidebar-item--connections ${active === 'connections' ? 'sidebar-item--active' : ''}`}
          onClick={() => onNavigate('connections')}
          aria-current={active === 'connections' ? 'page' : undefined}
          title="Conexiones — Telegram y Google"
        >
          <span className="sidebar-item-icon" aria-hidden="true">🔌</span>
          <span className="sidebar-item-label">Conexiones</span>
          <span className="sidebar-item-badge" aria-hidden="true">Nuevo</span>
        </button>

        {/* Medios de comunicación — placeholder */}
        <button
          className="sidebar-item sidebar-item--placeholder"
          onClick={() => setActivePanel({ icon: '💬', label: 'Medios de comunicación', description: 'Gestiona todos tus canales de comunicación con clientes desde aquí.' })}
          title="Próximamente"
        >
          <span className="sidebar-item-icon" aria-hidden="true">💬</span>
          <span className="sidebar-item-label">Medios de comunicación</span>
        </button>

        {/* Integraciones — placeholder */}
        <button
          className="sidebar-item sidebar-item--placeholder"
          onClick={() => setActivePanel({ icon: '🔗', label: 'Integraciones', description: 'Conecta herramientas externas como Notion, Google Drive y más.' })}
          title="Próximamente"
        >
          <span className="sidebar-item-icon" aria-hidden="true">🔗</span>
          <span className="sidebar-item-label">Integraciones</span>
        </button>

        {PLACEHOLDER_ITEMS.map(item => (
          <button
            key={item.label}
            className="sidebar-item sidebar-item--placeholder"
            onClick={() => setActivePanel(item)}
            title="Próximamente"
          >
            <span className="sidebar-item-icon" aria-hidden="true">{item.icon}</span>
            <span className="sidebar-item-label">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Footer with settings */}
      <div className="sidebar-footer">
        <button
          className={`sidebar-item ${active === 'settings' ? 'sidebar-item--active' : ''}`}
          onClick={() => onNavigate('settings')}
          aria-current={active === 'settings' ? 'page' : undefined}
        >
          <span className="sidebar-item-icon" aria-hidden="true">⚙</span>
          <span className="sidebar-item-label">Configuración</span>
        </button>
        <div className="sidebar-user">
          <div className="sidebar-avatar" aria-hidden="true">A</div>
          <span className="sidebar-username">Admin</span>
        </div>
      </div>
      <ResizeHandle onMouseDown={handleMouseDown} onDoubleClick={handleDoubleClick} />
      {activePanel && (
        <ProximamentePanel
          item={activePanel}
          onDismiss={() => setActivePanel(null)}
        />
      )}
    </aside>
  )
}
