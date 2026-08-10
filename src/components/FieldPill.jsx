import React, { useState, useRef, useEffect } from 'react'
import { PRIORITY_OPTIONS, STAGE_OPTIONS } from '../config.js'

export default function FieldPill({ type, value, taskId, onUpdate }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handler(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (type === 'client') return <ClientPill value={value} taskId={taskId} onUpdate={onUpdate} />
  if (type === 'progress') return (
    <span className="pill pill-progress" title="Avance">
      <span className="pill-icon" aria-hidden="true">🔢</span>{value ?? 0}%
    </span>
  )

  const options = type === 'priority' ? PRIORITY_OPTIONS : STAGE_OPTIONS
  const current = options[value] ?? Object.values(options)[0]

  return (
    <div className="pill-wrapper" ref={ref}>
      <button
        className="pill pill-select"
        style={{ '--pill-color': current.color }}
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${type === 'priority' ? 'Prioridad' : 'Etapa'}: ${current.name}`}
      >
        <span className="pill-icon" aria-hidden="true">⊡</span>
        {current.name}
        <span className="pill-arrow" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="pill-dropdown" role="listbox" onClick={e => e.stopPropagation()}>
          <p className="dropdown-label">{type === 'priority' ? 'PRIORIDAD' : 'ETAPA'}</p>
          {Object.values(options).map(opt => (
            <button
              key={opt.id}
              className={`dropdown-option ${value === opt.id ? 'selected' : ''}`}
              style={{ '--opt-color': opt.color }}
              role="option"
              aria-selected={value === opt.id}
              onClick={() => { onUpdate(taskId, type, opt.id); setOpen(false) }}
            >
              {opt.name}
            </button>
          ))}
          <div className="dropdown-divider" />
          <button className="dropdown-footer-btn" onClick={() => setOpen(false)}>✏ Editar campo</button>
        </div>
      )}
    </div>
  )
}

function ClientPill({ value, taskId, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const inputRef = useRef(null)

  useEffect(() => { if (editing) { setDraft(value || ''); inputRef.current?.focus() } }, [editing])

  function save() { onUpdate(taskId, 'client', draft.trim()); setEditing(false) }

  if (editing) return (
    <input
      ref={inputRef}
      className="pill-client-input"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
      placeholder="Cliente..."
      onClick={e => e.stopPropagation()}
    />
  )

  return (
    <button
      className="pill pill-client"
      onClick={e => { e.stopPropagation(); setEditing(true) }}
      title="Editar cliente"
    >
      <span className="pill-icon" aria-hidden="true">Aa</span>
      {value || <span className="pill-placeholder">Cliente</span>}
    </button>
  )
}
