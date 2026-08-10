import React, { useState, useRef } from 'react'

/**
 * Panel de checklist — lista de ítems con checkbox.
 * Los cambios se guardan inmediatamente en el store (localStorage).
 */
export default function ChecklistPanel({ items, onChange }) {
  const [newText, setNewText] = useState('')
  const inputRef = useRef(null)

  function addItem() {
    const text = newText.trim()
    if (!text) return
    onChange([...items, { id: Date.now(), text, done: false }])
    setNewText('')
    inputRef.current?.focus()
  }

  function toggleItem(id) {
    onChange(items.map(i => i.id === id ? { ...i, done: !i.done } : i))
  }

  function removeItem(id) {
    onChange(items.filter(i => i.id !== id))
  }

  function editItem(id, text) {
    if (!text.trim()) { removeItem(id); return }
    onChange(items.map(i => i.id === id ? { ...i, text: text.trim() } : i))
  }

  const done = items.filter(i => i.done).length
  const total = items.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="subpanel checklist-panel">
      <div className="checklist-header">
        <p className="subpanel-title">Checklist</p>
        {total > 0 && (
          <span className="checklist-progress-label">{done}/{total}</span>
        )}
      </div>

      {total > 0 && (
        <div className="checklist-bar">
          <div className="checklist-fill" style={{ width: `${pct}%` }} />
        </div>
      )}

      <ul className="checklist-list">
        {items.length === 0 && (
          <li className="checklist-empty">Sin ítems. Agrega uno abajo.</li>
        )}
        {items.map(item => (
          <ChecklistItem
            key={item.id}
            item={item}
            onToggle={() => toggleItem(item.id)}
            onEdit={text => editItem(item.id, text)}
            onRemove={() => removeItem(item.id)}
          />
        ))}
      </ul>

      <div className="checklist-add">
        <input
          ref={inputRef}
          className="form-input"
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addItem() }}
          placeholder="Nuevo ítem..."
        />
        <button
          className="btn-sm-primary"
          onClick={addItem}
          disabled={!newText.trim()}
        >+</button>
      </div>
    </div>
  )
}

function ChecklistItem({ item, onToggle, onEdit, onRemove }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.text)

  function save() {
    onEdit(draft)
    setEditing(false)
  }

  return (
    <li className={`checklist-item ${item.done ? 'checklist-item--done' : ''}`}>
      <button
        className={`check ${item.done ? 'checked' : ''}`}
        onClick={onToggle}
        aria-label={item.done ? 'Desmarcar' : 'Marcar'}
        aria-pressed={item.done}
      >
        {item.done ? '✓' : ''}
      </button>

      {editing ? (
        <input
          className="checklist-edit-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          autoFocus
        />
      ) : (
        <span
          className="checklist-text"
          onDoubleClick={() => setEditing(true)}
          title="Doble clic para editar"
        >
          {item.text}
        </span>
      )}

      <button
        className="checklist-remove"
        onClick={onRemove}
        aria-label="Eliminar ítem"
      >×</button>
    </li>
  )
}
