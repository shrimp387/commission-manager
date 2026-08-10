import React, { useState, useMemo, useEffect } from 'react'
import { getArchived, removeArchived, updateArchivedTags, loadArchivedFromSupabase } from '../store/archiveDb.js'
import { PRIORITY_OPTIONS, STAGE_OPTIONS } from '../config.js'

const STATUS_ALL = 'all'

function formatDuration(ms) {
  const days = Math.floor(ms / 86400000)
  if (days > 0) return `${days}d`
  const h = Math.floor(ms / 3600000)
  return h > 0 ? `${h}h` : '<1h'
}

function TagEditor({ tags, onChange }) {
  const [input, setInput] = useState('')
  function add() {
    const t = input.trim().toLowerCase()
    if (!t || tags.includes(t)) { setInput(''); return }
    onChange([...tags, t])
    setInput('')
  }
  return (
    <div className="arch-tag-editor">
      {tags.map(tag => (
        <span key={tag} className="arch-tag">
          #{tag}
          <button onClick={() => onChange(tags.filter(t => t !== tag))} aria-label={`Quitar tag ${tag}`}>×</button>
        </span>
      ))}
      <input
        className="arch-tag-input"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        placeholder="+ tag"
      />
    </div>
  )
}

export default function ArchivedPage() {
  const [items, setItems] = useState(() => getArchived())
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState(STATUS_ALL)
  const [filterPriority, setFilterPriority] = useState(STATUS_ALL)
  const [selected, setSelected] = useState(null)

  // Load from Supabase on mount (source of truth for user-scoped data)
  useEffect(() => {
    loadArchivedFromSupabase().then(data => {
      if (data && data.length > 0) setItems(data)
    }).catch(() => {})
  }, [])

  function refresh() {
    const all = getArchived()
    setItems(all)
    if (selected) setSelected(all.find(a => a.id === selected.id) ?? null)
  }

  function handleDelete(id) {
    if (!confirm('¿Eliminar permanentemente este registro?')) return
    removeArchived(id)
    if (selected?.id === id) setSelected(null)
    refresh()
  }

  function handleTagChange(id, tags) {
    updateArchivedTags(id, tags)
    refresh()
  }

  const filtered = useMemo(() => {
    return items.filter(a => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        a.text.toLowerCase().includes(q) ||
        a.client.toLowerCase().includes(q) ||
        a.tags.some(t => t.includes(q))
      const matchStage = filterStage === STATUS_ALL || a.stage === filterStage
      const matchPriority = filterPriority === STATUS_ALL || a.priority === filterPriority
      return matchSearch && matchStage && matchPriority
    })
  }, [items, search, filterStage, filterPriority])

  const totalTime = items.reduce((acc, a) => acc + (a.timer || 0), 0)

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-bg" aria-hidden="true" />
        <div className="page-header-content">
          <div className="page-header-brand">
            <div className="page-header-icon">🗂</div>
            <div>
              <p className="page-header-eyebrow">HISTORIAL</p>
              <h1 className="page-header-title">Archivados</h1>
              <p className="page-header-sub">
                {items.length} comisiones · {Math.floor(totalTime / 3600)}h totales trabajadas
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Search + filters */}
        <div className="arch-toolbar">
          <div className="arch-search-wrap">
            <span className="arch-search-icon">🔍</span>
            <input
              className="arch-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre, cliente o tag..."
              aria-label="Buscar archivados"
            />
            {search && (
              <button className="arch-search-clear" onClick={() => setSearch('')} aria-label="Limpiar">×</button>
            )}
          </div>

          <div className="arch-filters">
            <select className="form-select arch-filter-select" value={filterStage} onChange={e => setFilterStage(e.target.value)}>
              <option value={STATUS_ALL}>Todas las etapas</option>
              {Object.values(STAGE_OPTIONS).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select className="form-select arch-filter-select" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
              <option value={STATUS_ALL}>Todas las prioridades</option>
              {Object.values(PRIORITY_OPTIONS).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="arch-empty">
            <p style={{ fontSize: '2rem' }}>🗂</p>
            <p>Aún no hay comisiones archivadas.</p>
            <p className="arch-empty-hint">Cuando marques una comisión como completa y la archives, aparecerá aquí.</p>
          </div>
        ) : (
          <div className="arch-layout">
            {/* List */}
            <div className="arch-list">
              {filtered.length === 0 ? (
                <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem', padding: '1rem' }}>Sin resultados para "{search}"</p>
              ) : (
                filtered.map(item => {
                  const stage = STAGE_OPTIONS[item.stage]
                  const priority = PRIORITY_OPTIONS[item.priority]
                  const isSelected = selected?.id === item.id
                  return (
                    <button
                      key={item.id}
                      className={`arch-item ${isSelected ? 'arch-item--active' : ''}`}
                      onClick={() => setSelected(item)}
                    >
                      {item.thumbnailUrl && (
                        <img src={item.thumbnailUrl} alt="" className="arch-item-thumb" />
                      )}
                      <div className="arch-item-body">
                        <div className="arch-item-title">{item.text}</div>
                        <div className="arch-item-meta">
                          {item.client && <span className="arch-meta-chip">👤 {item.client}</span>}
                          {stage && (
                            <span className="arch-meta-chip" style={{ color: stage.color }}>
                              {stage.name}
                            </span>
                          )}
                          <span className="arch-meta-chip arch-meta-date">
                            {new Date(item.archivedAt).toLocaleDateString('es')}
                          </span>
                        </div>
                        {item.tags.length > 0 && (
                          <div className="arch-item-tags">
                            {item.tags.slice(0, 3).map(t => (
                              <span key={t} className="arch-tag-sm">#{t}</span>
                            ))}
                            {item.tags.length > 3 && <span className="arch-tag-sm">+{item.tags.length - 3}</span>}
                          </div>
                        )}
                      </div>
                      {priority && (
                        <div
                          className="arch-item-priority"
                          style={{ background: priority.color }}
                          title={priority.name}
                        />
                      )}
                    </button>
                  )
                })
              )}
            </div>

            {/* Detail */}
            {selected && (
              <div className="arch-detail">
                <div className="arch-detail-header">
                  <h2 className="arch-detail-title">{selected.text}</h2>
                  <button
                    className="btn-danger"
                    onClick={() => handleDelete(selected.id)}
                    title="Eliminar permanentemente"
                  >🗑 Eliminar</button>
                </div>

                {selected.thumbnailUrl && (
                  <img src={selected.thumbnailUrl} alt="Referencia" className="arch-detail-thumb" />
                )}

                <div className="arch-detail-grid">
                  {selected.client && (
                    <div className="arch-detail-field">
                      <label>Cliente</label><span>{selected.client}</span>
                    </div>
                  )}
                  <div className="arch-detail-field">
                    <label>Etapa final</label>
                    <span style={{ color: STAGE_OPTIONS[selected.stage]?.color }}>
                      {STAGE_OPTIONS[selected.stage]?.name ?? selected.stage}
                    </span>
                  </div>
                  <div className="arch-detail-field">
                    <label>Prioridad</label>
                    <span style={{ color: PRIORITY_OPTIONS[selected.priority]?.color }}>
                      {PRIORITY_OPTIONS[selected.priority]?.name}
                    </span>
                  </div>
                  {selected.assignee && (
                    <div className="arch-detail-field">
                      <label>Asignado a</label><span>{selected.assignee}</span>
                    </div>
                  )}
                  {selected.deadline && (
                    <div className="arch-detail-field">
                      <label>Fecha límite</label><span>{selected.deadline}</span>
                    </div>
                  )}
                  {selected.timer > 0 && (
                    <div className="arch-detail-field">
                      <label>Tiempo trabajado</label>
                      <span>⏱ {Math.floor(selected.timer / 3600)}h {Math.floor((selected.timer % 3600) / 60)}m</span>
                    </div>
                  )}
                  {selected.comments > 0 && (
                    <div className="arch-detail-field">
                      <label>Comentarios</label><span>💬 {selected.comments}</span>
                    </div>
                  )}
                  <div className="arch-detail-field">
                    <label>Archivado el</label>
                    <span>{new Date(selected.archivedAt).toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  </div>
                  {selected.checklist?.length > 0 && (
                    <div className="arch-detail-field arch-detail-field--full">
                      <label>Checklist</label>
                      <span>{selected.checklist.filter(i => i.done).length}/{selected.checklist.length} completados</span>
                    </div>
                  )}
                </div>

                {selected.notes && (
                  <div className="arch-detail-notes">
                    <label className="form-label">Notas</label>
                    <p>{selected.notes}</p>
                  </div>
                )}

                <div className="arch-detail-tags-section">
                  <label className="form-label">Tags</label>
                  <TagEditor
                    tags={selected.tags}
                    onChange={tags => handleTagChange(selected.id, tags)}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
