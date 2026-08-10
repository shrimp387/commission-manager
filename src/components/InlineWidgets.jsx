/**
 * Widgets inline que se muestran dentro del panel de cada comisión.
 * Cada widget es colapsable y persiste en el store.
 */
import React, { useState, useRef } from 'react'
import DatePickerPopup from './DatePickerPopup.jsx'
import EmojiReactions from './EmojiReactions.jsx'
import TimerPanel from './TimerPanel.jsx'
import CommentsPanel from './CommentsPanel.jsx'
import FileUploadPanel from './FileUploadPanel.jsx'
import ChecklistPanel from './ChecklistPanel.jsx'

/* Compact date picker — shows input + mini toggle calendar */
function CompactDatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)

  function handleChange(date) {
    onChange(date)
    setSaved(true)
    setOpen(false)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="compact-date">
      <div className="compact-date-row">
        <input
          type="date"
          className="compact-date-input"
          value={value}
          onChange={e => handleChange(e.target.value)}
        />
        <button
          className="compact-date-cal"
          onClick={() => setOpen(o => !o)}
          aria-label="Abrir calendario"
          aria-expanded={open}
        >📅</button>
        {value && (
          <button className="compact-date-clear" onClick={() => handleChange('')} title="Quitar fecha">×</button>
        )}
        {saved && <span className="compact-date-saved">✓ Guardado</span>}
      </div>
      {value && <p className="compact-date-display">{value}</p>}
      {open && (
        <div className="compact-date-popup">
          <DatePickerPopup value={value} onChange={handleChange} />
        </div>
      )}
    </div>
  )
}

function WidgetShell({ icon, title, onRemove, children }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="widget">
      <div className="widget-header">
        <button
          className="widget-toggle"
          onClick={() => setCollapsed(c => !c)}
          aria-expanded={!collapsed}
        >
          <span className="widget-icon" aria-hidden="true">{icon}</span>
          <span className="widget-title">{title}</span>
          <span className="widget-chevron" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
        </button>
        <button
          className="widget-remove"
          onClick={onRemove}
          aria-label={`Cerrar ${title}`}
          title="Quitar widget"
        >×</button>
      </div>
      {!collapsed && (
        <div className="widget-body">{children}</div>
      )}
    </div>
  )
}

export default function InlineWidgets({ taskId, fields, updateField }) {
  const activeWidgets = fields.activeWidgets || []
  const fileInputRef = useRef(null)

  function removeWidget(id) {
    updateField(taskId, 'activeWidgets', activeWidgets.filter(w => w !== id))
  }

  if (activeWidgets.length === 0) return null

  return (
    <div className="inline-widgets">
      {/* File upload widget */}
      {activeWidgets.includes('files') && (
        <WidgetShell icon="📎" title="Archivos adjuntos" onRemove={() => removeWidget('files')}>
          <FileUploadPanel
            attachments={fields.attachments || []}
            taskId={taskId}
            onChange={a => updateField(taskId, 'attachments', a)}
          />
        </WidgetShell>
      )}

      {/* Embed widget */}
      {activeWidgets.includes('embed') && (
        <WidgetShell icon="🔗" title="Embed / Link" onRemove={() => removeWidget('embed')}>
          <EmbedWidget
            value={fields.embedUrl || ''}
            onChange={v => updateField(taskId, 'embedUrl', v)}
          />
        </WidgetShell>
      )}

      {/* Checklist widget */}
      {activeWidgets.includes('checklist') && (
        <WidgetShell icon="📋" title="Checklist" onRemove={() => removeWidget('checklist')}>
          <ChecklistPanel
            items={fields.checklist || []}
            onChange={items => updateField(taskId, 'checklist', items)}
          />
        </WidgetShell>
      )}

      {/* Comments widget */}
      {activeWidgets.includes('comments') && (
        <WidgetShell icon="💬" title="Comentarios" onRemove={() => removeWidget('comments')}>
          <CommentsPanel
            comments={fields.comments || []}
            onChange={c => updateField(taskId, 'comments', c)}
          />
        </WidgetShell>
      )}

      {/* Deadline widget */}
      {activeWidgets.includes('deadline') && (
        <WidgetShell icon="📅" title={fields.deadline ? `Fecha: ${fields.deadline}` : 'Fecha límite'} onRemove={() => removeWidget('deadline')}>
          <CompactDatePicker
            value={fields.deadline || ''}
            onChange={date => updateField(taskId, 'deadline', date)}
          />
        </WidgetShell>
      )}

      {/* Assignee widget */}
      {activeWidgets.includes('assignee') && (
        <WidgetShell icon="👤" title="Asignado a" onRemove={() => removeWidget('assignee')}>
          <AssigneeWidget
            value={fields.assignee || ''}
            onChange={v => updateField(taskId, 'assignee', v)}
          />
        </WidgetShell>
      )}

      {/* Timer widget */}
      {activeWidgets.includes('timer') && (
        <WidgetShell icon="⏱" title="Temporizador" onRemove={() => removeWidget('timer')}>
          <TimerPanel
            elapsed={fields.timer || 0}
            running={fields.timerRunning || false}
            onUpdate={(elapsed, running) => {
              updateField(taskId, 'timer', elapsed)
              updateField(taskId, 'timerRunning', running)
            }}
          />
        </WidgetShell>
      )}

      {/* Reactions widget */}
      {activeWidgets.includes('reactions') && (
        <WidgetShell icon="😀" title="Reacciones" onRemove={() => removeWidget('reactions')}>
          <EmojiReactions
            reactions={fields.reactions || {}}
            onChange={r => updateField(taskId, 'reactions', r)}
          />
        </WidgetShell>
      )}
    </div>
  )
}

function EmbedWidget({ value, onChange }) {
  const [draft, setDraft] = useState(value)
  const [confirmed, setConfirmed] = useState(!!value)

  function save() {
    onChange(draft.trim())
    setConfirmed(true)
  }

  if (confirmed && value) {
    const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(value)
    const isYoutube = /youtube\.com|youtu\.be/.test(value)
    return (
      <div className="embed-preview">
        {isImage && <img src={value} alt="Embed" className="embed-img" />}
        {isYoutube && (
          <iframe
            src={value.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
            className="embed-iframe"
            title="YouTube embed"
            allowFullScreen
          />
        )}
        {!isImage && !isYoutube && (
          <a href={value} target="_blank" rel="noopener noreferrer" className="embed-link">
            🔗 {value.slice(0, 60)}{value.length > 60 ? '…' : ''}
          </a>
        )}
        <button className="embed-change" onClick={() => setConfirmed(false)}>
          Cambiar URL
        </button>
      </div>
    )
  }

  return (
    <div className="embed-input-row">
      <input
        className="form-input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder="https://... (imagen, YouTube, link)"
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') save() }}
      />
      <button className="btn-sm-primary" onClick={save} disabled={!draft.trim()}>
        Agregar
      </button>
    </div>
  )
}

function AssigneeWidget({ value, onChange }) {
  const [draft, setDraft] = useState(value)
  return (
    <div className="assignee-widget">
      {value && (
        <div className="assignee-current">
          <span className="assignee-avatar-lg">{value[0].toUpperCase()}</span>
          <span className="assignee-name">{value}</span>
          <button className="assignee-clear" onClick={() => { onChange(''); setDraft('') }}>×</button>
        </div>
      )}
      <div className="assignee-input-row">
        <input
          className="form-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Nombre del asignado..."
          onKeyDown={e => { if (e.key === 'Enter') onChange(draft.trim()) }}
        />
        <button className="btn-sm-primary" onClick={() => onChange(draft.trim())} disabled={!draft.trim()}>
          Asignar
        </button>
      </div>
    </div>
  )
}
