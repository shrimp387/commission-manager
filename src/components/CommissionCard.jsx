import React, { useState } from 'react'

export default function CommissionCard({ task, onToggle, onSelect, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const completedSubtasks = task.children?.filter(c => c.completed).length ?? 0
  const totalSubtasks = task.children?.length ?? 0
  const hasSubtasks = totalSubtasks > 0
  const progress = hasSubtasks ? Math.round((completedSubtasks / totalSubtasks) * 100) : null

  function handleDelete(e) {
    e.stopPropagation()
    if (confirmDelete) {
      onDelete(task.id)
    } else {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
    }
  }

  return (
    <article
      className={`commission-card ${task.completed ? 'completed' : ''}`}
      onClick={() => onSelect(task)}
      role="button"
      tabIndex={0}
      aria-label={`Comisión: ${task.text}${task.completed ? ' (completada)' : ''}`}
      onKeyDown={e => e.key === 'Enter' && onSelect(task)}
    >
      <div className="card-top">
        <button
          className={`checkbox ${task.completed ? 'checked' : ''}`}
          onClick={e => { e.stopPropagation(); onToggle(task.id, task.completed) }}
          aria-label={task.completed ? 'Marcar como incompleta' : 'Marcar como completada'}
          aria-pressed={task.completed}
        >
          {task.completed ? '✓' : ''}
        </button>
        <span className="card-title">{task.text}</span>
        <button
          className={`delete-btn ${confirmDelete ? 'confirm' : ''}`}
          onClick={handleDelete}
          aria-label={confirmDelete ? 'Confirmar eliminación' : 'Eliminar comisión'}
          title={confirmDelete ? '¿Seguro? Click para confirmar' : 'Eliminar'}
        >
          {confirmDelete ? '!' : '×'}
        </button>
      </div>

      {hasSubtasks && (
        <div className="card-progress" aria-label={`Progreso: ${completedSubtasks} de ${totalSubtasks} pasos`}>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <span className="progress-text">{completedSubtasks}/{totalSubtasks}</span>
        </div>
      )}

      {hasSubtasks && (
        <ul className="subtask-list" aria-label="Pasos de la comisión">
          {task.children.map(child => (
            <li
              key={child.id}
              className={`subtask ${child.completed ? 'done' : ''}`}
            >
              <span className="subtask-dot" aria-hidden="true">
                {child.completed ? '✓' : '○'}
              </span>
              {child.text}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
