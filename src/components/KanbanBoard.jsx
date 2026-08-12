import React, { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTaskStore } from '../store/taskStore.js'
import { PRIORITY_OPTIONS, STAGE_OPTIONS } from '../config.js'
import FieldPill from './FieldPill.jsx'
import TaskContextMenu from './TaskContextMenu.jsx'
import CompletionBanner from './CompletionBanner.jsx'
import StickerOverlay from './StickerOverlay.jsx'
import StickerPanel from './StickerPanel.jsx'
import PublishPanel from './PublishPanel.jsx'
import { getTelegramConfig, getTelegramFileUrl } from '../utils/telegram.js'
import { isGmailConnected, sendDeliveryEmail } from '../utils/gmail.js'
import { getConfig } from '../store/appConfig.js'
import { saveKanbanConfig } from '../lib/db.js'

/* ─── STICKER QUICK BUTTON ──────────────────────────────────────── */
// Sits below the card reactions — a quick 🎭 button
function StickerQuickButton({ reactions, onUpdate }) {
  const [open, setOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState({})
  const btnRef = useRef(null)
  const anchorRef = useRef(null)

  function handleOpen() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const sidebarW = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w') || '230', 10
      ) || 230
      const panelW = 320
      let left = rect.left
      left = Math.max(left, sidebarW)
      if (left + panelW > window.innerWidth) left = window.innerWidth - panelW
      left = Math.max(left, sidebarW)
      const openUp = rect.bottom + 420 > window.innerHeight
      setPanelStyle(openUp
        ? { position: 'fixed', left, bottom: window.innerHeight - rect.top + 4, width: panelW, zIndex: 9999 }
        : { position: 'fixed', left, top: rect.bottom + 4, width: panelW, zIndex: 9999 }
      )
    }
    setOpen(o => !o)
  }

  async function handleSelect(sticker) {
    const key = '__sticker__' + sticker.file_unique_id
    const cfg = getTelegramConfig()
    const token = cfg?.token || ''
    const thumbFileId = sticker.thumbnail?.file_id ?? sticker.thumb?.file_id
    let thumbUrl = null
    if (token && thumbFileId) {
      thumbUrl = await getTelegramFileUrl(token, thumbFileId)
    }
    if (!thumbUrl || !thumbUrl.startsWith('http')) {
      thumbUrl = sticker.emoji || '🖼'
    }
    onUpdate({
      ...reactions,
      [key]: {
        type: 'sticker',
        file_id: sticker.file_id,
        file_unique_id: sticker.file_unique_id,
        is_video: sticker.is_video ?? false,
        emoji: sticker.emoji ?? null,
        thumbUrl,
        count: (reactions[key]?.count || 0) + 1,
      }
    })
    setOpen(false)
  }

  return (
    <div className="sticker-quick-wrap" onClick={e => e.stopPropagation()}>
      <button
        ref={btnRef}
        className="sticker-quick-btn"
        onClick={handleOpen}
        aria-label="Agregar sticker de Telegram"
        title="Agregar sticker de Telegram"
      >
        <img
          src="/telegram-logo.webp"
          alt="Telegram"
          className="sticker-quick-tg-logo"
        />
      </button>
      {open && (
        <div style={panelStyle}>
          <div ref={anchorRef} style={{ height: 0 }} />
          <StickerPanel
            anchorRef={anchorRef}
            onSelect={handleSelect}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  )
}

/* ─── INLINE COMMENTS ───────────────────────────────────────────── */
function InlineComments({ comments, onChange }) {
  const [text, setText] = useState('')
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? comments : comments.slice(-2)

  function add() {
    if (!text.trim()) return
    onChange([...comments, { id: Date.now(), text: text.trim(), author: 'Admin', createdAt: new Date().toISOString() }])
    setText('')
  }

  return (
    <div className="kanban-comments-section" onClick={e => e.stopPropagation()}>
      {comments.length > 2 && !expanded && (
        <button className="kanban-show-more" onClick={() => setExpanded(true)}>
          Ver {comments.length - 2} anterior(es) ↑
        </button>
      )}
      {visible.map(c => (
        <div key={c.id} className="kanban-comment">
          <span className="kanban-comment-author">{c.author}</span>
          <span className="kanban-comment-time">
            {new Date(c.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <p className="kanban-comment-text">{c.text}</p>
        </div>
      ))}
      <div className="kanban-comment-input">
        <input className="kanban-comment-field" value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
          placeholder="Comentar... (Enter)" />
        <button className="kanban-comment-send" onClick={add} disabled={!text.trim()}>↵</button>
      </div>
    </div>
  )
}

/* ─── KANBAN CARD ───────────────────────────────────────────────── */
function KanbanCard({ task, sectionId, onToggle, onDelete, onAdd, onRename, onDragStart, onOpenPublishPanel }) {
  const navigate = useNavigate()
  const { getFields, updateField, ensureTask } = useTaskStore()
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(task.text)
  const [showCtx, setShowCtx] = useState(false)
  const triggerRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const nameRef = useRef(null)
  const handleRef = useRef(null)

  React.useEffect(() => { ensureTask(task.id, task, sectionId) }, [task.id])
  React.useEffect(() => { if (editingName) nameRef.current?.focus() }, [editingName])

  const fields = getFields(task.id)
  const done = task.children?.filter(c => c.completed).length ?? 0
  const total = task.children?.length ?? 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const priority = PRIORITY_OPTIONS[fields.priority ?? 'ok']
  const stage = STAGE_OPTIONS[fields.stage ?? 'new']
  const attachments = fields.attachments || []
  const reactions = fields.reactions || {}
  // Separate regular emoji reactions (numbers) from sticker reactions (objects)
  const regularReactions = Object.entries(reactions).filter(
    ([k, v]) => !k.startsWith('__sticker__') && typeof v === 'number' && v > 0
  )
  const hasReactions = regularReactions.length > 0
  const hasStickerReactions = Object.keys(reactions).some(
    k => k.startsWith('__sticker__') && reactions[k]
  )
  const [stickerEditMode, setStickerEditMode] = useState(false)
  // localStickerPositions: { [reactionKey]: {x, y} } — owned here, committed on "Listo"
  const [localStickerPositions, setLocalStickerPositions] = useState({})

  // Delivery email state
  const [deliveryNote, setDeliveryNote] = useState('')
  const [showDeliveryNote, setShowDeliveryNote] = useState(false)
  const [deliverySending, setDeliverySending] = useState(false)
  const [deliveryStatus, setDeliveryStatus] = useState(null) // {ok, msg}

  async function handleDeliverArtwork() {
    const clientEmail = fields.clientEmail
    const clientName = fields.clientName || fields.client || 'Cliente'
    if (!clientEmail) {
      setDeliveryStatus({ ok: false, msg: 'No hay email del cliente guardado para esta comisión.' })
      return
    }
    // Find the first attached image
    const imageAttachment = (fields.attachments || []).find(a => a.type?.startsWith('image/'))
    if (!imageAttachment) {
      setDeliveryStatus({ ok: false, msg: 'Adjunta la imagen final en alta calidad antes de entregar.' })
      return
    }
    setDeliverySending(true)
    setDeliveryStatus(null)
    try {
      const cfg = getConfig()
      await sendDeliveryEmail({
        clientEmail,
        clientName,
        taskName: task.text,
        imageUrl: imageAttachment.url,
        imageName: imageAttachment.name,
        note: deliveryNote,
        studioName: cfg.projectName,
      })
      setDeliveryStatus({ ok: true, msg: `📧 Obra entregada a ${clientEmail}` })
      setShowDeliveryNote(false)
      setDeliveryNote('')
    } catch (err) {
      setDeliveryStatus({ ok: false, msg: `Error al enviar: ${err.message}` })
    } finally {
      setDeliverySending(false)
    }
  }

  function handleMoveLocal(key, x, y) {
    setLocalStickerPositions(prev => ({ ...prev, [key]: { x, y } }))
  }

  function handleStickerDone() {
    // Commit all dragged positions to the store
    if (Object.keys(localStickerPositions).length > 0) {
      const updated = { ...reactions }
      Object.entries(localStickerPositions).forEach(([k, pos]) => {
        if (updated[k]) updated[k] = { ...updated[k], x: pos.x, y: pos.y }
      })
      updateField(task.id, 'reactions', updated)
    }
    setLocalStickerPositions({})
    setStickerEditMode(false)
  }
  const comments = fields.comments || []
  const checklist = fields.checklist || []
  const checkDone = checklist.filter(i => i.done).length

  function saveName() {
    const trimmed = nameVal.trim()
    if (trimmed && trimmed !== task.text) onRename(task.id, trimmed)
    setEditingName(false)
  }

  return (
    <div className={[
      'kanban-card',
      task.completed ? 'kanban-card--done' : '',
      fields.pinned ? 'kanban-card--pinned' : '',
      dragging ? 'kanban-card--dragging' : '',
    ].filter(Boolean).join(' ')}>

      {/* Drag row — ONLY the handle is draggable */}
      <div className="kanban-card-drag-row">
        <span
          ref={handleRef}
          className="kanban-drag-handle"
          draggable
          onDragStart={e => {
            setDragging(true)
            e.dataTransfer.setData('taskId', task.id)
            e.dataTransfer.setData('fromSection', sectionId)
            e.dataTransfer.effectAllowed = 'move'
            onDragStart?.(e, task, sectionId)
          }}
          onDragEnd={() => setDragging(false)}
          title="Arrastrar para mover"
          aria-hidden="true"
        >⠿</span>

        <div className="ctx-wrapper" style={{ marginLeft: 'auto', position: 'relative' }}>
          <button
            ref={triggerRef}
            className="ctx-trigger kanban-ctx-btn"
            onClick={e => { e.stopPropagation(); setShowCtx(v => !v) }}
            aria-label="Opciones" aria-expanded={showCtx}>⋯</button>
          {showCtx && (
            <TaskContextMenu
              task={task} fields={fields} onUpdate={updateField}
              onDelete={onDelete}
              onAddAbove={() => onAdd(task.text + ' (copia)', sectionId)}
              onAddBelow={t => onAdd(t || task.text + ' (copia)', sectionId)}
              onClose={() => setShowCtx(false)}
              triggerRef={triggerRef}
            />
          )}
        </div>
      </div>

      {/* Collapsed drag preview */}
      {dragging && (
        <div className="kanban-drag-ghost">
          <span className="kanban-card-title">{task.text}</span>
        </div>
      )}

      <div style={{ display: dragging ? 'none' : 'contents' }}>
        {/* Thumbnail */}
        {attachments.filter(a => a.type?.startsWith('image/')).slice(0, 1).map(a => (
          <div key={a.id} className="kanban-thumb"><img src={a.url} alt={a.name} /></div>
        ))}

        {/* Checkbox + title */}
        <div className="kanban-card-header">
          <button className={`check ${task.completed ? 'checked' : ''}`}
            onClick={e => { e.stopPropagation(); onToggle(task.id, task.completed) }}
            aria-pressed={task.completed}>{task.completed ? '✓' : ''}</button>
          {editingName ? (
            <input ref={nameRef} className="kanban-name-input" value={nameVal}
              onChange={e => setNameVal(e.target.value)} onBlur={saveName}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setNameVal(task.text); setEditingName(false) } }}
              onClick={e => e.stopPropagation()} />
          ) : (
            <span className={`kanban-card-title ${task.completed ? 'struck' : ''}`}
              onDoubleClick={e => { e.stopPropagation(); setEditingName(true) }}
              title="Doble clic para editar">
              {fields.pinned && '⭐ '}{task.text}
            </span>
          )}
        </div>

        {/* Pills */}
        <div className="kanban-card-pills">
          <FieldPill type="priority" value={fields.priority ?? 'ok'} taskId={task.id} onUpdate={updateField} />
          <FieldPill type="client" value={fields.client ?? ''} taskId={task.id} onUpdate={updateField} />
          <FieldPill type="stage" value={fields.stage ?? 'new'} taskId={task.id} onUpdate={updateField} />
        </div>

        {fields.deadline && <p className="kanban-deadline">📅 {fields.deadline}</p>}
        {fields.assignee && (
          <div className="kanban-assignee">
            <span className="assignee-avatar">{fields.assignee[0].toUpperCase()}</span>
            <span>{fields.assignee}</span>
          </div>
        )}

        {total > 0 && (
          <div className="kanban-progress">
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
            <span className="progress-text">{done}/{total}</span>
          </div>
        )}

        {checklist.length > 0 && (
          <div className="kanban-checklist-mini">
            <div className="progress-bar" style={{ marginBottom: '0.2rem' }}>
              <div className="progress-fill" style={{ width: `${Math.round(checkDone / checklist.length * 100)}%` }} />
            </div>
            {checklist.slice(0, 3).map(item => (
              <div key={item.id} className={`kanban-checklist-item ${item.done ? 'done' : ''}`}>
                <button className={`check ${item.done ? 'checked' : ''}`}
                  style={{ width: 12, height: 12, fontSize: '0.45rem' }}
                  onClick={e => { e.stopPropagation(); updateField(task.id, 'checklist', checklist.map(i => i.id === item.id ? { ...i, done: !i.done } : i)) }}>
                  {item.done ? '✓' : ''}
                </button>
                <span>{item.text}</span>
              </div>
            ))}
            {checklist.length > 3 && <p className="kanban-checklist-more">+{checklist.length - 3} más</p>}
          </div>
        )}

        {fields.timer > 0 && <p className="kanban-timer">⏱ {Math.floor(fields.timer / 60)}m</p>}

        {hasStickerReactions && !stickerEditMode && (
          <StickerOverlay
            reactions={reactions}
            onChange={r => updateField(task.id, 'reactions', r)}
            editMode={false}
            localPositions={{}}
          />
        )}

        {hasReactions && (
          <div className="row-reactions">
            {regularReactions.map(([e, v]) => (
              <span key={e} className="reaction-chip">{e} {v}</span>
            ))}
          </div>
        )}

        {/* Sticker toolbar: Telegram logo button + Mover toggle */}
        <div className="sticker-toolbar" onClick={e => e.stopPropagation()}>
          <StickerQuickButton
            reactions={reactions}
            onUpdate={r => updateField(task.id, 'reactions', r)}
          />
          {hasStickerReactions && !stickerEditMode && (
            <button
              className="sticker-edit-toggle"
              onClick={() => setStickerEditMode(true)}
              title="Mover stickers"
              aria-label="Activar modo edición de stickers"
            >
              ↔ Mover
            </button>
          )}
        </div>

        {(attachments.length > 0 || comments.length > 0) && (
          <div className="kanban-meta-counts">
            {attachments.length > 0 && <span>⬆{attachments.length}</span>}
            {comments.length > 0 && <span>💬{comments.length}</span>}
          </div>
        )}

        {comments.length > 0 && (
          <InlineComments comments={comments} onChange={c => updateField(task.id, 'comments', c)} />
        )}

        {/* Completion banner — shown when awaitingArchive is true */}
        {fields.awaitingArchive && (
          <CompletionBanner
            task={task}
            fields={fields}
            onArchive={(taskId) => {
              updateField(taskId, 'awaitingArchive', false)
              updateField(taskId, 'archived', true)
              onDelete(taskId)
            }}
            onDelete={onDelete}
            onReopen={(taskId) => {
              updateField(taskId, 'completedState', false)
              updateField(taskId, 'awaitingArchive', false)
              updateField(taskId, 'stage', 'sketch')
            }}
          />
        )}

        {/* ── Delivery button — shown when clientEmail is set and there are image attachments ── */}
        {fields.clientEmail && isGmailConnected() && (fields.attachments || []).some(a => a.type?.startsWith('image/')) && (
          <div className="delivery-section" onClick={e => e.stopPropagation()}>
            {deliveryStatus && (
              <p className={`delivery-status ${deliveryStatus.ok ? 'delivery-status--ok' : 'delivery-status--err'}`}>
                {deliveryStatus.msg}
              </p>
            )}
            {showDeliveryNote && (
              <textarea
                className="form-textarea"
                value={deliveryNote}
                onChange={e => setDeliveryNote(e.target.value)}
                placeholder="Nota opcional para el cliente (ej: 'Aquí está tu obra, fue un placer trabajarla!')"
                rows={2}
                style={{ marginBottom: '0.4rem', fontSize: '0.75rem' }}
              />
            )}
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              <button
                className="delivery-btn"
                onClick={handleDeliverArtwork}
                disabled={deliverySending}
                title={`Enviar obra final a ${fields.clientEmail}`}
              >
                {deliverySending ? '⏳ Enviando...' : '📤 Entregar obra'}
              </button>
              <button
                className="btn-sm-ghost"
                onClick={() => setShowDeliveryNote(v => !v)}
                title="Agregar nota personal"
              >
                {showDeliveryNote ? '— Sin nota' : '✏ Nota'}
              </button>
            </div>
            <p style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
              → {fields.clientEmail}
            </p>
          </div>
        )}

        {/* ── Publish button — shown when stage is 'delivered' ── */}
        {fields.stage === 'delivered' && (
          <div className="publish-section" onClick={e => e.stopPropagation()}>
            <button
              className="publish-btn"
              disabled={!(fields.attachments || []).some(a => a.type?.startsWith('image/'))}
              title={
                (fields.attachments || []).some(a => a.type?.startsWith('image/'))
                  ? 'Preparar publicación'
                  : 'Adjunta la imagen final antes de publicar'
              }
              onClick={e => {
                e.stopPropagation()
                navigate(`/publish/${task.id}`)
              }}
            >
              📢 Preparar publicación
            </button>
          </div>
        )}
      </div>

      {/* Edit-mode overlay — covers the full card as a sibling (position:absolute) */}
      {stickerEditMode && hasStickerReactions && (
        <StickerOverlay
          reactions={reactions}
          onChange={r => updateField(task.id, 'reactions', r)}
          editMode={true}
          localPositions={localStickerPositions}
          onMoveLocal={handleMoveLocal}
        />
      )}

      {/* Floating "Listo" button — OUTSIDE the blue overlay so it's always clickable */}
      {stickerEditMode && (
        <button
          className="sticker-done-float"
          onClick={(e) => { e.stopPropagation(); handleStickerDone() }}
          aria-label="Guardar posiciones y salir del modo edición"
          title="Guardar y salir"
        >
          ✓ Listo
        </button>
      )}
    </div>
  )
}

/* ─── KANBAN COLUMN ─────────────────────────────────────────────── */
function KanbanColumn({ section, onToggle, onDelete, onAdd, onRename, onDrop, onReorder, isCustom, onDeleteSection, onRecolorSection, onClearSection, onRenameSection, onOpenPublishPanel }) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [dropIndicator, setDropIndicator] = useState(null)
  const [collapsed, setCollapsed] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(section.label.replace(/^[\S]+\s/, ''))
  const settingsRef = useRef(null)

  // Close settings on outside click
  React.useEffect(() => {
    if (!showSettings) return
    function handler(e) {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setShowSettings(false)
        setShowColorPicker(false)
      }
    }
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 10)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler) }
  }, [showSettings])

  function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim()) return
    onAdd(text.trim(), section.id)
    setText('')
    setAdding(false)
  }

  function handleDragOverCard(e, taskId) {
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const position = e.clientY < rect.top + rect.height / 2 ? 'above' : 'below'
    setDropIndicator({ taskId, position })
  }

  function handleDropOnCard(e, taskId) {
    e.preventDefault()
    e.stopPropagation()
    const draggedId = e.dataTransfer.getData('taskId')
    const fromSection = e.dataTransfer.getData('fromSection')
    setDropIndicator(null)
    setIsDragOver(false)
    if (!draggedId) return
    if (fromSection === section.id) {
      const items = section.items.map(t => t.id)
      const fromIdx = items.indexOf(draggedId)
      let toIdx = items.indexOf(taskId)
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return
      const rect = e.currentTarget.getBoundingClientRect()
      const insertAfter = e.clientY > rect.top + rect.height / 2
      const newOrder = [...items]
      newOrder.splice(fromIdx, 1)
      const adjustedTo = fromIdx < toIdx ? toIdx - 1 : toIdx
      newOrder.splice(insertAfter ? adjustedTo + 1 : adjustedTo, 0, draggedId)
      onReorder(section.id, newOrder)
    } else {
      onDrop(e, section.id, taskId)
    }
  }

  const icon = section.label.split(' ')[0]
  const titleText = section.label.replace(/^[\S]+\s/, '')

  return (
    <div
      className={`kanban-column ${isDragOver ? 'drag-over' : ''} ${collapsed ? 'kanban-column--collapsed' : ''}`}
      style={{ '--col-accent': section.color }}
      onDragOver={e => { if (!collapsed) { e.preventDefault(); setIsDragOver(true) } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) { setIsDragOver(false); setDropIndicator(null) } }}
      onDrop={e => { if (!collapsed) { setIsDragOver(false); setDropIndicator(null); onDrop(e, section.id, null) } }}
    >
      <div className="kanban-column-header">
        <button
          className="kanban-collapse-btn"
          onClick={() => setCollapsed(v => !v)}
          title={collapsed ? 'Expandir' : 'Colapsar'}
          aria-label={collapsed ? 'Expandir columna' : 'Colapsar columna'}
        >
          {collapsed ? '▶' : '▾'}
        </button>

        <span className="kanban-column-icon">{icon}</span>

        {editingName ? (
          <input
            className="kanban-column-name-input"
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onBlur={() => {
              if (nameVal.trim()) onRenameSection?.(section.id, icon + ' ' + nameVal.trim())
              setEditingName(false)
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') { if (nameVal.trim()) onRenameSection?.(section.id, icon + ' ' + nameVal.trim()); setEditingName(false) }
              if (e.key === 'Escape') setEditingName(false)
            }}
            autoFocus
          />
        ) : (
          <h3 className="kanban-column-title" onDoubleClick={() => setEditingName(true)} title="Doble clic para renombrar">
            {titleText}
          </h3>
        )}

        <span className="kanban-column-count">{section.items.length}</span>

        {/* Settings menu */}
        <div style={{ position: 'relative' }} ref={settingsRef}>
          <button
            className="kanban-settings-btn"
            onClick={() => { setShowSettings(v => !v); setShowColorPicker(false) }}
            title="Configuración de sección"
            aria-label="Configuración"
          >⚙</button>

          {showSettings && (
            <div className="kanban-settings-menu" onClick={e => e.stopPropagation()}>
              {/* Color picker row */}
              <div className="kanban-settings-section">
                <p className="kanban-settings-label">Color del halo</p>
                <div className="kanban-settings-colors">
                  {ACCENT_COLORS.map(c => (
                    <button key={c} type="button"
                      className={`kanban-color-swatch${section.color === c ? ' selected' : ''}`}
                      style={{ background: c, width: 20, height: 20 }}
                      onClick={() => { onRecolorSection?.(section.id, c) }}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                </div>
              </div>

              <div className="kanban-settings-divider" />

              <button className="kanban-settings-item" onClick={() => { setCollapsed(v => !v); setShowSettings(false) }}>
                {collapsed ? '▶ Expandir columna' : '▾ Colapsar columna'}
              </button>
              <button className="kanban-settings-item" onClick={() => { setEditingName(true); setShowSettings(false) }}>
                ✎ Renombrar sección
              </button>
              {isCustom && (
                <>
                  <button className="kanban-settings-item" onClick={() => { onClearSection?.(section.id); setShowSettings(false) }}>
                    🗑 Limpiar sección
                  </button>
                  <div className="kanban-settings-divider" />
                  <button className="kanban-settings-item kanban-settings-item--danger" onClick={() => { onDeleteSection?.(section.id); setShowSettings(false) }}>
                    ✕ Eliminar sección
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="kanban-cards">
            {section.items.length === 0 && (
              <div className="kanban-empty">{isDragOver ? '📥 Suelta aquí' : 'Sin comisiones'}</div>
            )}
            {section.items.map(task => (
              <div key={task.id}
                onDragOver={e => handleDragOverCard(e, task.id)}
                onDrop={e => handleDropOnCard(e, task.id)}
              >
                {dropIndicator?.taskId === task.id && dropIndicator.position === 'above' && (
                  <div className="kanban-drop-line" />
                )}
                <KanbanCard task={task} sectionId={section.id}
                  onToggle={onToggle} onDelete={onDelete} onAdd={onAdd} onRename={onRename}
                  onDragStart={() => {}} onOpenPublishPanel={onOpenPublishPanel} />
                {dropIndicator?.taskId === task.id && dropIndicator.position === 'below' && (
                  <div className="kanban-drop-line" />
                )}
              </div>
            ))}
          </div>

          {adding ? (
            <form className="kanban-add-form" onSubmit={handleSubmit}>
              <textarea className="kanban-add-input" value={text}
                onChange={e => setText(e.target.value)} placeholder="Nombre..." autoFocus rows={2}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e) } }} />
              <div className="kanban-add-btns">
                <button type="submit" className="btn-sm-primary" disabled={!text.trim()}>Agregar</button>
                <button type="button" className="btn-sm-ghost" onClick={() => { setAdding(false); setText('') }}>×</button>
              </div>
            </form>
          ) : (
            <button className="kanban-add-btn" onClick={() => setAdding(true)}>+ Agregar tarjeta</button>
          )}
        </>
      )}

      {collapsed && (
        <div className="kanban-collapsed-count">
          {section.items.length} tarjeta{section.items.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}

/* ─── NEW SECTION FORM ──────────────────────────────────────────── */
const ACCENT_COLORS = ['#7c6af7','#f87171','#34d399','#60a5fa','#fbbf24','#e879f9','#94a3b8','#fb923c']

function NewSectionForm({ onConfirm, onCancel }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(ACCENT_COLORS[0])

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    onConfirm(name.trim(), color)
    setName('')
  }

  return (
    <div className="kanban-column" style={{ '--col-accent': color, minWidth: 260 }}>
      <div className="kanban-column-header">
        <span className="kanban-column-icon">✨</span>
        <h3 className="kanban-column-title" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Nueva sección
        </h3>
        <button className="kanban-delete-section-btn" onClick={onCancel} aria-label="Cancelar">×</button>
      </div>

      <form onSubmit={handleSubmit} style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        <input
          className="form-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Nombre de la sección..."
          autoFocus
        />

        <div>
          <p className="form-label" style={{ marginBottom: '0.4rem' }}>Color del halo</p>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {ACCENT_COLORS.map(c => (
              <button
                key={c}
                type="button"
                className={`kanban-color-swatch${color === c ? ' selected' : ''}`}
                style={{ background: c, width: 22, height: 22 }}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
          <button type="submit" className="btn-sm-primary" disabled={!name.trim()} style={{ flex: 1 }}>
            ✓ Crear sección
          </button>
          <button type="button" className="btn-sm-ghost" onClick={onCancel}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}

/* ─── KANBAN BOARD ──────────────────────────────────────────────── */
export default function KanbanBoard({ sections, loading, onToggle, onDelete, onAdd, onRename, onMoveTask }) {
  const [orderOverrides, setOrderOverrides] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kanban_order') || '{}') }
    catch { return {} }
  })

  const [colorOverrides, setColorOverrides] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kanban_colors') || '{}') }
    catch { return {} }
  })

  const [customSections, setCustomSections] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kanban_custom_sections') || '[]') }
    catch { return [] }
  })

  // ── Publish panel state ───────────────────────────────────────────────────
  const [publishPanelTaskId, setPublishPanelTaskId] = useState(null)
  const { getFields, data: taskStoreData } = useTaskStore()

  function handleOpenPublishPanel(taskId) {
    setPublishPanelTaskId(taskId)
  }

  // ── Persist kanban config to BOTH localStorage AND Supabase ──────────────
  function persistKanban({ order, colors, custom, labels }) {
    const current = {
      orderOverrides: order ?? orderOverrides,
      colorOverrides: colors ?? colorOverrides,
      customSections: custom ?? customSections,
      labelOverrides: labels ?? JSON.parse(localStorage.getItem('kanban_labels') || '{}'),
    }
    // localStorage (immediate, for local reads)
    localStorage.setItem('kanban_order', JSON.stringify(current.orderOverrides))
    localStorage.setItem('kanban_colors', JSON.stringify(current.colorOverrides))
    localStorage.setItem('kanban_custom_sections', JSON.stringify(current.customSections))
    localStorage.setItem('kanban_labels', JSON.stringify(current.labelOverrides))
    // Supabase (fire-and-forget)
    saveKanbanConfig(current).catch(e => console.warn('[kanban] Supabase sync failed:', e?.message))
  }

  function saveCustomSections(updated) {
    setCustomSections(updated)
    persistKanban({ custom: updated })
  }

  function handleDrop(e, targetSectionId) {
    const taskId = e.dataTransfer.getData('taskId')
    const fromSectionId = e.dataTransfer.getData('fromSection')
    if (!taskId || fromSectionId === targetSectionId) return
    onMoveTask?.(taskId, fromSectionId, targetSectionId)
  }

  function handleReorder(sectionId, newOrder) {
    const updated = { ...orderOverrides, [sectionId]: newOrder }
    setOrderOverrides(updated)
    persistKanban({ order: updated })
  }

  function handleRecolor(sectionId, color) {
    const updatedColors = { ...colorOverrides, [sectionId]: color }
    setColorOverrides(updatedColors)
    const updatedCustom = customSections.map(s => s.id === sectionId ? { ...s, color } : s)
    setCustomSections(updatedCustom)
    persistKanban({ colors: updatedColors, custom: updatedCustom })
  }

  function handleRenameSection(sectionId, newLabel) {
    const updatedCustom = customSections.map(s => s.id === sectionId ? { ...s, label: newLabel } : s)
    setCustomSections(updatedCustom)
    const labelOverrides = JSON.parse(localStorage.getItem('kanban_labels') || '{}')
    labelOverrides[sectionId] = newLabel
    persistKanban({ custom: updatedCustom, labels: labelOverrides })
  }

  const [showNewSectionForm, setShowNewSectionForm] = useState(false)

  const labelOverrides = (() => { try { return JSON.parse(localStorage.getItem('kanban_labels') || '{}') } catch { return {} } })()

  const orderedSections = sections.map(section => {
    const order = orderOverrides[section.id]
    const color = colorOverrides[section.id] || section.color
    const label = labelOverrides[section.id] || section.label
    const base = { ...section, color, label }
    if (!order) return base
    const itemMap = Object.fromEntries(base.items.map(t => [t.id, t]))
    const ordered = order.map(id => itemMap[id]).filter(Boolean)
    const missing = base.items.filter(t => !order.includes(t.id))
    return { ...base, items: [...ordered, ...missing] }
  })

  const allSections = [
    ...orderedSections,
    // Custom sections — items come from orderedSections if available (built from tasks)
    // Otherwise fall back to empty (they'll be populated by useTasks buildSections)
    ...customSections
      .filter(cs => !orderedSections.some(s => s.id === cs.id)) // avoid duplicates
      .map(cs => ({
        ...cs,
        color: colorOverrides[cs.id] || cs.color,
        items: [],
      })),
  ]

  function handleConfirmNewSection(name, color) {
    const id = 'custom_' + Date.now()
    saveCustomSections([...customSections, { id, label: name, color, items: [] }])
    setShowNewSectionForm(false)
  }

  function deleteCustomSection(id) {
    saveCustomSections(customSections.filter(s => s.id !== id))
  }

  if (loading && !sections.some(s => s.items.length)) {
    return <div className="kanban-loading"><div className="mini-spinner" /><p>Cargando...</p></div>
  }

  return (
    <div className="kanban-board">
      {allSections.map(section => {
        const isCustom = customSections.some(cs => cs.id === section.id)
        return (
          <KanbanColumn key={section.id} section={section}
            onToggle={onToggle} onDelete={onDelete} onAdd={onAdd}
            onRename={onRename || (() => {})}
            onDrop={handleDrop}
            onReorder={handleReorder}
            isCustom={isCustom}
            onDeleteSection={isCustom ? deleteCustomSection : undefined}
            onRecolorSection={handleRecolor}
            onRenameSection={handleRenameSection}
            onClearSection={isCustom ? (id) => saveCustomSections(customSections.map(s => s.id === id ? { ...s, items: [] } : s)) : undefined}
            onOpenPublishPanel={handleOpenPublishPanel}
          />
        )
      })}
      {showNewSectionForm
        ? <NewSectionForm onConfirm={handleConfirmNewSection} onCancel={() => setShowNewSectionForm(false)} />
        : <button className="kanban-add-section-btn" onClick={() => setShowNewSectionForm(true)}>+ Nueva sección</button>
      }

      {/* Publish Panel overlay — mounted as sibling of the board */}
      {publishPanelTaskId && (() => {
        const allTasks = sections.flatMap(s => s.items)
        const task = allTasks.find(t => t.id === publishPanelTaskId)
        const fields = getFields(publishPanelTaskId)
        if (!task) return null
        return (
          <PublishPanel
            key={publishPanelTaskId}
            taskId={publishPanelTaskId}
            task={task}
            fields={fields}
            onClose={() => setPublishPanelTaskId(null)}
          />
        )
      })()}
    </div>
  )
}
