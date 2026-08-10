import React, { useState } from 'react'
import CommissionCard from './CommissionCard.jsx'

export default function Column({ section, onToggle, onSelect, onAdd, onDelete }) {
  const [adding, setAdding] = useState(false)
  const [newText, setNewText] = useState('')

  function handleAdd(e) {
    e.preventDefault()
    const text = newText.trim()
    if (!text) return
    onAdd(text, section.id)
    setNewText('')
    setAdding(false)
  }

  return (
    <section
      className="column"
      aria-label={section.label}
      style={{ '--column-accent': section.color }}
    >
      <div className="column-header">
        <h2 className="column-title">{section.label}</h2>
        <span className="column-count" aria-label={`${section.items.length} elementos`}>
          {section.items.length}
        </span>
      </div>

      <ul className="card-list" role="list">
        {section.items.length === 0 && (
          <li className="empty-column" aria-live="polite">
            <span>Sin comisiones aquí</span>
          </li>
        )}
        {section.items.map(task => (
          <li key={task.id}>
            <CommissionCard
              task={task}
              onToggle={onToggle}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          </li>
        ))}
      </ul>

      {adding ? (
        <form className="add-form" onSubmit={handleAdd}>
          <input
            className="add-input"
            value={newText}
            onChange={e => setNewText(e.target.value)}
            placeholder="Nombre de la comisión..."
            autoFocus
            aria-label="Nombre de la nueva comisión"
          />
          <div className="add-actions">
            <button type="submit" className="btn btn-primary" disabled={!newText.trim()}>
              Agregar
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setAdding(false); setNewText('') }}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          className="add-card-btn"
          onClick={() => setAdding(true)}
          aria-label={`Agregar comisión a ${section.label}`}
        >
          + Agregar comisión
        </button>
      )}
    </section>
  )
}
