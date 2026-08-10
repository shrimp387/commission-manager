import React, { useState } from 'react'
import { useTasks } from '../hooks/useTasks.js'
import Dashboard from '../components/Dashboard.jsx'
import WorkflowBoard from '../components/WorkflowBoard.jsx'
import KanbanBoard from '../components/KanbanBoard.jsx'
import NewCommissionModal from '../components/NewCommissionModal.jsx'
import { useTaskStore } from '../store/taskStore.js'
import { useConfig } from '../hooks/useConfig.js'
import { saveUiPref } from '../lib/db.js'

export default function StudioPage() {
  const { sections, loading, error, syncStatus, reload, toggleTask, addCommission, removeTask, renameTask, moveTask } = useTasks()
  const { saveStatus, getFields } = useTaskStore()
  const config = useConfig()

  const userId = localStorage.getItem('_current_user_id') || 'default'
  const viewKey = `studio_view_mode_${userId}`
  const collapseKey = `studio_header_collapsed_${userId}`

  const [view, setView] = useState(() => localStorage.getItem(viewKey) || 'list')
  const [showNew, setShowNew] = useState(false)
  const [headerCollapsed, setHeaderCollapsed] = useState(() => localStorage.getItem(collapseKey) === 'true')

  function toggleHeader() {
    const next = !headerCollapsed
    setHeaderCollapsed(next)
    saveUiPref('studio_header_collapsed', next)
    localStorage.setItem(collapseKey, String(next))
  }

  function handleSetView(v) {
    setView(v)
    saveUiPref('studio_view_mode', v)
    localStorage.setItem(viewKey, v)
  }

  const allItems = sections.flatMap(s => s.items)
  const active = allItems.filter(t => !t.completed).length
  const activeTasks = allItems.filter(t => !t.completed)
  const inReview = sections.find(s => s.label.includes('Revisión'))?.items.filter(t => !t.completed).length ?? 0
  const urgent = active // fallback if getFields not ready yet

  return (
    <div className="page">
      {/* Page header */}
      <div className={`page-header${headerCollapsed ? ' page-header--collapsed' : ''}`} style={config.projectBannerUrl ? {
        backgroundImage: `linear-gradient(to bottom, rgba(13,13,18,0.4), rgba(13,13,18,0.95)), url(${config.projectBannerUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      } : {}}>
        <div className="page-header-bg" aria-hidden="true" />
        <div className="page-header-content">
          <div className="page-header-brand">
            <div className="page-header-icon" aria-hidden="true">{config.projectIcon || '🔭'}</div>
            <div>
              {!headerCollapsed && <p className="page-header-eyebrow">ESTUDIO CREATIVO</p>}
              <h1 className="page-header-title">{config.projectName || 'Estudio de Comisiones'}</h1>
              {!headerCollapsed && <p className="page-header-sub">{config.projectSubtitle || 'De la idea a la entrega, con cada etapa visible.'}</p>}
            </div>
          </div>
          <button
            className="btn-icon-only header-collapse-btn"
            onClick={toggleHeader}
            aria-label={headerCollapsed ? 'Expandir encabezado' : 'Colapsar encabezado'}
            aria-expanded={!headerCollapsed}
            title={headerCollapsed ? 'Expandir encabezado' : 'Colapsar encabezado'}
          >
            {headerCollapsed ? '▲' : '▼'}
          </button>
          {!headerCollapsed && (
            <div className="page-header-actions">
              <button className="btn-ghost-icon" title="Abrir asistente">✦ Abrir asistente</button>
              {saveStatus === 'saving' && <span className="save-indicator">Guardando...</span>}
              {saveStatus === 'saved' && <span className="save-indicator save-indicator--ok">✓ Guardado</span>}
              <button className="btn-icon-only" title="Configuración">⚙</button>
              <button className="btn-primary" onClick={() => setShowNew(true)}>
                + Nueva comisión
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="page-body">
        {error && (
          <div className="error-banner" role="alert">
            ⚠️ {error}
            <button onClick={reload} className="retry-btn">Reintentar</button>
          </div>
        )}
        {syncStatus === 'syncing' && (
          <div className="sync-banner sync-banner--syncing" role="status">
            <span className="mini-spinner" style={{ display: 'inline-block', marginRight: '0.4rem' }} />
            Sincronizando...
          </div>
        )}

        <Dashboard active={active} inReview={inReview} urgent={urgent} loading={loading}
          activeTasks={activeTasks} getFields={getFields} />

        <div className="section-header">
          <div>
            <p className="section-eyebrow">FLUJO DE TRABAJO</p>
            <h2 className="section-title">Tu estudio, de la idea a la entrega</h2>
          </div>
          <div className="section-actions">
            {/* View toggle */}
            <div className="view-toggle" role="group" aria-label="Cambiar vista">
              <button
                className={`view-toggle-btn ${view === 'list' ? 'active' : ''}`}
                onClick={() => handleSetView('list')}
                aria-pressed={view === 'list'}
              >
                ☰ Lista
              </button>
              <button
                className={`view-toggle-btn ${view === 'board' ? 'active' : ''}`}
                onClick={() => handleSetView('board')}
                aria-pressed={view === 'board'}
              >
                ⊞ Tablero
              </button>
            </div>
            <button className="btn-outline" onClick={reload} disabled={loading}>
              ↻ Actualizar
            </button>
          </div>
        </div>

        {view === 'list' ? (
          <WorkflowBoard
            sections={sections}
            loading={loading}
            onToggle={toggleTask}
            onAdd={addCommission}
            onDelete={removeTask}
            onRename={renameTask}
          />
        ) : (
          <KanbanBoard
            sections={sections}
            loading={loading}
            onToggle={toggleTask}
            onAdd={addCommission}
            onDelete={removeTask}
            onRename={renameTask}
            onMoveTask={moveTask}
          />
        )}
      </div>

      {showNew && (
        <NewCommissionModal
          sections={sections}
          onAdd={addCommission}
          onClose={() => setShowNew(false)}
        />
      )}
    </div>
  )
}
