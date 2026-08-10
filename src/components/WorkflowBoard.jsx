import React, { useState, useEffect, useRef } from 'react'
import FieldPill from './FieldPill.jsx'
import TaskContextMenu from './TaskContextMenu.jsx'
import PlusWidgetMenu from './PlusWidgetMenu.jsx'
import InlineWidgets from './InlineWidgets.jsx'
import StickerOverlay from './StickerOverlay.jsx'
import { useTaskStore } from '../store/taskStore.js'
import { PRIORITY_OPTIONS, STAGE_OPTIONS } from '../config.js'

function SubtaskRow({ task, onToggle }) {
  return (
    <li className={`subtask-row ${task.completed ? 'done' : ''}`}>
      <button className={`check ${task.completed ? 'checked' : ''}`}
        onClick={e => { e.stopPropagation(); onToggle(task.id, task.completed) }}>
        {task.completed ? '✓' : ''}
      </button>
      <span className="subtask-text">{task.text}</span>
    </li>
  )
}

function CommissionRow({ task, sectionId, onToggle, onDelete, onAddAbove, onAddBelow, onRename }) {
  const { getFields, updateField, ensureTask } = useTaskStore()
  const [expanded, setExpanded] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(task.text)
  const [showCtx, setShowCtx] = useState(false)
  const [showPlus, setShowPlus] = useState(false)
  const nameRef = useRef(null)
  const hasChildren = task.children?.length > 0
  const done = task.children?.filter(c => c.completed).length ?? 0
  const total = task.children?.length ?? 0

  useEffect(() => { ensureTask(task.id, task, sectionId) }, [task.id])
  useEffect(() => { if (editingName) nameRef.current?.focus() }, [editingName])

  const fields = getFields(task.id)
  const pinned = fields.pinned

  function saveName() {
    if (nameVal.trim() && nameVal.trim() !== task.text) onRename(task.id, nameVal.trim())
    setEditingName(false)
  }

  const reactions = fields.reactions || {}
  // Only count regular emoji reactions (not sticker objects) for the summary row
  const regularReactions = Object.entries(reactions).filter(
    ([k, v]) => !k.startsWith('__sticker__') && (typeof v === 'number' ? v > 0 : false)
  )
  const hasReactions = regularReactions.length > 0
  const hasStickerReactions = Object.keys(reactions).some(
    k => k.startsWith('__sticker__') && reactions[k]
  )
  const attachments = fields.attachments || []
  const comments = fields.comments || []

  // Debug: log when sticker reactions change
  if (hasStickerReactions) {
    const stickerEntries = Object.entries(reactions).filter(([k]) => k.startsWith('__sticker__'))
    console.debug('[CommissionRow] sticker reactions for', task.id, stickerEntries)
  }

  return (
    <div className={`commission-row ${task.completed ? 'completed' : ''} ${pinned ? 'commission-row--pinned' : ''}`}>
      <div className="row-main">
        <button className={`check ${task.completed ? 'checked' : ''}`}
          onClick={() => onToggle(task.id, task.completed)} />

        {hasChildren ? (
          <button className="expand-btn" onClick={() => setExpanded(e => !e)}
            aria-expanded={expanded}>{expanded ? '▾' : '▸'}</button>
        ) : (
          <span className="expand-placeholder" aria-hidden="true" />
        )}

        {editingName ? (
          <input
            ref={nameRef}
            className="row-title-input"
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onBlur={saveName}
            onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setNameVal(task.text); setEditingName(false) } }}
            aria-label="Editar nombre de comisión"
          />
        ) : (
          <span
            className={`row-title ${task.completed ? 'struck' : ''}`}
            onDoubleClick={() => setEditingName(true)}
            title="Doble click para editar"
          >
            {pinned && <span className="pin-icon" aria-label="Destacada">⭐</span>}
            {task.text}
          </span>
        )}

        {/* Attachment count */}
        {attachments.length > 0 && (
          <span className="attach-count" title={`${attachments.length} archivo(s)`}>
            ⬆{attachments.length}
          </span>
        )}

        {/* Comment count */}
        {comments.length > 0 && (
          <span className="comment-count" title={`${comments.length} comentario(s)`}>
            💬{comments.length}
          </span>
        )}

        {/* 3-dot menu */}
        <div className="ctx-wrapper">
          <button
            className="ctx-trigger"
            onClick={e => { e.stopPropagation(); setShowCtx(v => !v) }}
            aria-label="Opciones de la tarea"
            aria-expanded={showCtx}
            aria-haspopup="menu"
          >⋯</button>
          {showCtx && (
            <TaskContextMenu
              task={task}
              fields={fields}
              onUpdate={updateField}
              onDelete={onDelete}
              onAddAbove={() => onAddAbove(task)}
              onAddBelow={(text) => onAddBelow(task, text)}
              onClose={() => setShowCtx(false)}
            />
          )}
        </div>
      </div>

      {/* Pills row */}
      <div className="row-fields">
        <FieldPill type="priority" value={fields.priority ?? 'ok'} taskId={task.id} onUpdate={updateField} />
        <FieldPill type="client" value={fields.client ?? ''} taskId={task.id} onUpdate={updateField} />
        <FieldPill type="stage" value={fields.stage ?? 'new'} taskId={task.id} onUpdate={updateField} />
        {total > 0 && <span className="pill pill-progress">{done}/{total}</span>}
        {fields.deadline && (
          <span className="pill pill-deadline" title="Fecha límite">📅 {fields.deadline}</span>
        )}
        {fields.assignee && (
          <span className="pill pill-assignee" title={`Asignado: ${fields.assignee}`}>
            <span className="assignee-avatar">{fields.assignee[0].toUpperCase()}</span>
            {fields.assignee}
          </span>
        )}
        {fields.timer > 0 && (
          <span className="pill pill-timer" title="Tiempo acumulado">
            ⏱ {Math.floor(fields.timer / 60)}m
          </span>
        )}
        <span className="pill pill-more">+2 más</span>
        {/* + button opens widget menu */}
        <div className="ctx-wrapper" style={{ position: 'relative' }}>
          <button
            className="pill pill-add"
            onClick={e => { e.stopPropagation(); setShowPlus(v => !v) }}
            aria-label="Agregar widget"
            aria-expanded={showPlus}
            title="Agregar imagen, checklist, fecha, comentario..."
          >+</button>
          {showPlus && (
            <PlusWidgetMenu
              activeWidgets={fields.activeWidgets || []}
              onToggleWidget={widgetId => {
                const current = fields.activeWidgets || []
                const updated = current.includes(widgetId)
                  ? current.filter(w => w !== widgetId)
                  : [...current, widgetId]
                updateField(task.id, 'activeWidgets', updated)
              }}
              onClose={() => setShowPlus(false)}
            />
          )}
        </div>
      </div>

      {/* Attachments thumbnails — big images */}
      {attachments.length > 0 && (
        <div className="row-attachments">
          {attachments.map(a => (
            <div key={a.id} className="row-thumb-wrap">
              {a.type?.startsWith('image/') ? (
                <>
                  <img src={a.url} alt={a.name} className="row-thumb" />
                  <span className="thumb-type-badge">
                    {a.name.split('.').pop().toUpperCase()}
                  </span>
                  <span className="row-thumb-label">{a.name.slice(0, 20)}</span>
                </>
              ) : (
                <div className="row-file-chip">
                  <span>📄</span>
                  <span>{a.name.slice(0, 20)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Sticker overlays — shown as physical stickers above the row */}
      {hasStickerReactions && (
        <StickerOverlay
          reactions={reactions}
          onChange={r => updateField(task.id, 'reactions', r)}
        />
      )}

      {/* Regular emoji reactions */}
      {hasReactions && (
        <div className="row-reactions">
          {regularReactions.map(([e, v]) => (
            <span key={e} className="reaction-chip">{e} {v}</span>
          ))}
        </div>
      )}

      {/* Checklist inline */}
      {(fields.checklist?.length || 0) > 0 && (
        <div className="row-checklist">
          <div className="row-checklist-bar">
            <div className="progress-bar" style={{ flex: 1, maxWidth: 120 }}>
              <div className="progress-fill" style={{
                width: `${Math.round((fields.checklist.filter(i => i.done).length / fields.checklist.length) * 100)}%`
              }} />
            </div>
            <span className="row-checklist-pct">
              {fields.checklist.filter(i => i.done).length}/{fields.checklist.length}
            </span>
          </div>
          {fields.checklist.map(item => (
            <div key={item.id} className={`row-checklist-item ${item.done ? 'done' : ''}`}>
              <button
                className={`check ${item.done ? 'checked' : ''}`}
                onClick={() => {
                  const updated = fields.checklist.map(i => i.id === item.id ? { ...i, done: !i.done } : i)
                  updateField(task.id, 'checklist', updated)
                }}
                style={{ width: 13, height: 13, fontSize: '0.5rem' }}
              >{item.done ? '✓' : ''}</button>
              {item.text}
            </div>
          ))}
        </div>
      )}

      {/* Inline widgets (files, embed, checklist, comments, deadline, assignee, timer, reactions) */}
      <InlineWidgets
        taskId={task.id}
        fields={fields}
        updateField={updateField}
      />

      {/* Subtasks */}
      {expanded && hasChildren && (
        <ul className="subtask-list" role="list">
          {task.children.map(child => (
            <SubtaskRow key={child.id} task={child} onToggle={onToggle} />
          ))}
        </ul>
      )}
    </div>
  )
}

function WorkflowSection({ section, onToggle, onAdd, onDelete, onRename, loading }) {
  const [expanded, setExpanded] = useState(true)
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')

  function handleAdd(e) {
    e.preventDefault()
    if (!text.trim()) return
    onAdd(text.trim(), section.id)
    setText('')
    setAdding(false)
  }

  function handleAddAbove(task) {
    const idx = section.items.findIndex(t => t.id === task.id)
    // For simplicity: add to section — full "above" would need API ordering
    onAdd(task.text + ' (copia)', section.id)
  }

  function handleAddBelow(task, customText) {
    onAdd(customText || (task.text + ' (copia)'), section.id)
  }

  return (
    <div className="wf-section">
      <div className="wf-section-header">
        <button className="wf-section-toggle" onClick={() => setExpanded(e => !e)} aria-expanded={expanded}>
          <span className="wf-section-arrow">{expanded ? '▾' : '▸'}</span>
          <span className="wf-section-icon" aria-hidden="true">{section.label.split(' ')[0]}</span>
          <span className="wf-section-name">{section.label.replace(/^[\S]+\s/, '')}</span>
          <span className="wf-section-count">{section.items.length}</span>
        </button>
      </div>

      {expanded && (
        <div className="wf-section-body">
          {loading && section.items.length === 0 ? (
            <div className="wf-loading"><div className="mini-spinner" /></div>
          ) : section.items.length === 0 ? (
            <p className="wf-empty">Sin comisiones en esta sección</p>
          ) : (
            section.items.map(task => (
              <CommissionRow
                key={task.id}
                task={task}
                sectionId={section.id}
                onToggle={onToggle}
                onDelete={onDelete}
                onAddAbove={handleAddAbove}
                onAddBelow={handleAddBelow}
                onRename={onRename}
              />
            ))
          )}
          {adding ? (
            <form className="inline-add-form" onSubmit={handleAdd}>
              <span className="expand-placeholder" aria-hidden="true" />
              <input className="inline-add-input" value={text} onChange={e => setText(e.target.value)}
                placeholder="Nombre de la comisión..." autoFocus />
              <div className="inline-add-btns">
                <button type="submit" className="btn-sm-primary" disabled={!text.trim()}>Agregar</button>
                <button type="button" className="btn-sm-ghost" onClick={() => { setAdding(false); setText('') }}>Cancelar</button>
              </div>
            </form>
          ) : (
            <button className="wf-add-inline" onClick={() => setAdding(true)}>+ Agregar comisión</button>
          )}
        </div>
      )}
    </div>
  )
}

export default function WorkflowBoard({ sections, loading, onToggle, onAdd, onDelete, onRename }) {
  return (
    <div className="wf-board">
      {sections.map(section => (
        <WorkflowSection key={section.id} section={section} loading={loading}
          onToggle={onToggle} onAdd={onAdd} onDelete={onDelete} onRename={onRename || (() => {})} />
      ))}
    </div>
  )
}
