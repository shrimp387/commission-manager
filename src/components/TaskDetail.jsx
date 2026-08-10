import React from 'react'

export default function TaskDetail({ task, onClose, onToggle }) {
  const completedSubtasks = task.children?.filter(c => c.completed).length ?? 0
  const totalSubtasks = task.children?.length ?? 0

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-title"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-panel">
        <div className="modal-header">
          <h2 id="detail-title" className="modal-title">{task.text}</h2>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Cerrar detalle"
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="detail-status">
            <span className={`status-badge ${task.completed ? 'done' : 'pending'}`}>
              {task.completed ? '✓ Completada' : '⏳ En curso'}
            </span>
            <button
              className="btn btn-secondary"
              onClick={() => onToggle(task.id, task.completed)}
            >
              {task.completed ? 'Marcar incompleta' : 'Marcar completa'}
            </button>
          </div>

          {totalSubtasks > 0 && (
            <div className="detail-section">
              <h3 className="section-label">
                Pasos ({completedSubtasks}/{totalSubtasks})
              </h3>
              <ul className="detail-subtasks" role="list">
                {task.children.map(child => (
                  <li
                    key={child.id}
                    className={`detail-subtask ${child.completed ? 'done' : ''}`}
                  >
                    <button
                      className={`checkbox ${child.completed ? 'checked' : ''}`}
                      onClick={() => onToggle(child.id, child.completed)}
                      aria-label={child.completed ? 'Marcar incompleto' : 'Marcar completo'}
                      aria-pressed={child.completed}
                    >
                      {child.completed ? '✓' : ''}
                    </button>
                    <span>{child.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="detail-meta">
            <p className="meta-item">
              <strong>ID Taskade:</strong>
              <code>{task.id}</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
