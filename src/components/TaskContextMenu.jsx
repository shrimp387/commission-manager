import React, { useState, useRef, useEffect } from 'react'
import DatePickerPopup from './DatePickerPopup.jsx'
import EmojiReactions from './EmojiReactions.jsx'
import StickerPanel from './StickerPanel.jsx'
import TimerPanel from './TimerPanel.jsx'
import CommentsPanel from './CommentsPanel.jsx'
import FileUploadPanel from './FileUploadPanel.jsx'
import ChecklistPanel from './ChecklistPanel.jsx'
import { getTelegramConfig, getTelegramFileUrl } from '../utils/telegram.js'
import { archiveTask } from '../store/archiveDb.js'

export default function TaskContextMenu({ task, fields, onUpdate, onDelete, onAddAbove, onAddBelow, onClose, triggerRef }) {
  const [sub, setSub] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (triggerRef?.current && triggerRef.current.contains(e.target)) return
      if (ref.current && ref.current.contains(e.target)) return
      onClose()
    }
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 10)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler) }
  }, [onClose, triggerRef])

  function copyLink() {
    navigator.clipboard?.writeText(task.id).catch(() => {})
    onClose()
  }

  function handleMarkComplete() {
    // Set stage to 'delivered', mark completedAt, show completion flow
    onUpdate(task.id, 'stage', 'delivered')
    onUpdate(task.id, 'completedState', true)
    onUpdate(task.id, 'completedAt', Date.now())
    onUpdate(task.id, 'awaitingArchive', true)
    onClose()
  }

  const isCompleted = task.completed || fields.completedState
  const awaitingArchive = fields.awaitingArchive

  const ACTIONS = [
    { icon: '↑', label: 'Agregar tarea arriba',     onClick: () => { onAddAbove?.(); onClose() } },
    { icon: '↓', label: 'Agregar tarea abajo',      onClick: () => { onAddBelow?.(); onClose() } },
    { icon: '📋', label: 'Añadir checklist',         sub: 'checklist' },
    { divider: true },
    { icon: '⭐', label: fields.pinned ? 'Quitar destacado' : 'Destacar',
      onClick: () => { onUpdate(task.id, 'pinned', !fields.pinned); onClose() } },
    {
      icon: isCompleted ? '↩' : '✓',
      label: isCompleted ? 'Reabrir comisión' : 'Marcar como completa',
      onClick: isCompleted
        ? () => { onUpdate(task.id, 'completedState', false); onUpdate(task.id, 'awaitingArchive', false); onClose() }
        : handleMarkComplete,
    },
    { icon: '⧉',  label: 'Duplicar',               onClick: () => { onAddBelow?.(task.text + ' (copia)'); onClose() } },
    { icon: '🔗', label: 'Copiar link',             onClick: copyLink },
    { divider: true },
    { icon: '📅', label: 'Fecha límite',            sub: 'deadline' },
    { icon: '👤', label: 'Asignar a',               sub: 'assignee' },
    { icon: '💬', label: 'Comentario',              sub: 'comments' },
    { icon: '📎', label: 'Subir archivo',           sub: 'files' },
    { icon: '⏱', label: 'Temporizador',            sub: 'timer' },
    { icon: '😀', label: 'Reacción',               sub: 'reactions' },
    { icon: '✈️', label: 'Stickers',               sub: 'stickers' },
    { divider: true },
    { icon: '🗑', label: 'Eliminar', danger: true,
      onClick: () => { if (confirm('¿Eliminar esta comisión?')) { onDelete(task.id); onClose() } } },
  ]

  const stickerBtnRef = useRef(null)

  return (
    <div className="ctx-menu" ref={ref} role="menu" onClick={e => e.stopPropagation()}>
      {sub === null ? (
        ACTIONS.map((action, i) => {
          if (action.divider) return <div key={i} className="ctx-divider" />
          return (
            <button
              key={action.label}
              ref={action.sub === 'stickers' ? stickerBtnRef : undefined}
              className={`ctx-item ${action.danger ? 'ctx-item--danger' : ''} ${action.label === 'Marcar como completa' ? 'ctx-item--complete' : ''}`}
              role="menuitem"
              onClick={() => action.sub ? setSub(action.sub) : action.onClick?.()}
            >
              <span className="ctx-icon" aria-hidden="true">{action.icon}</span>
              {action.label}
              {action.sub && <span className="ctx-arrow" aria-hidden="true">›</span>}
            </button>
          )
        })
      ) : (
        <div className="ctx-subpanel">
          <button className="ctx-back" onClick={() => setSub(null)}>‹ Volver</button>
          {sub === 'checklist' && (
            <ChecklistPanel items={fields.checklist || []} onChange={items => onUpdate(task.id, 'checklist', items)} />
          )}
          {sub === 'deadline' && (
            <DatePickerPopup value={fields.deadline} onChange={date => { onUpdate(task.id, 'deadline', date); setSub(null) }} />
          )}
          {sub === 'assignee' && (
            <AssigneePanel value={fields.assignee} onChange={v => { onUpdate(task.id, 'assignee', v); setSub(null) }} />
          )}
          {sub === 'comments' && (
            <CommentsPanel comments={fields.comments || []} onChange={c => onUpdate(task.id, 'comments', c)} />
          )}
          {sub === 'files' && (
            <FileUploadPanel attachments={fields.attachments || []} onChange={a => onUpdate(task.id, 'attachments', a)} />
          )}
          {sub === 'timer' && (
            <TimerPanel elapsed={fields.timer || 0} running={fields.timerRunning || false}
              onUpdate={(elapsed, running) => { onUpdate(task.id, 'timer', elapsed); onUpdate(task.id, 'timerRunning', running) }} />
          )}
          {sub === 'reactions' && (
            <EmojiReactions reactions={fields.reactions || {}} onChange={r => onUpdate(task.id, 'reactions', r)} />
          )}
          {sub === 'stickers' && (
            <StickerSubPanel
              reactions={fields.reactions || {}}
              onUpdate={r => {
                console.debug('[TaskContextMenu] reactions updated:', r)
                onUpdate(task.id, 'reactions', r)
              }}
              onBack={() => setSub(null)}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Sticker sub-panel (inline, no popover) ─────────────────────────────────────
function StickerSubPanel({ reactions, onUpdate, onBack }) {
  const anchorRef = useRef(null)

  async function handleStickerSelect(sticker) {
    const key = '__sticker__' + sticker.file_unique_id
    const cfg = getTelegramConfig()
    const token = cfg?.token || ''

    // Resolve the real CDN URL via getFile — file_path is NOT in getStickerSet response
    const thumbFileId = sticker.thumbnail?.file_id ?? sticker.thumb?.file_id
    let thumbUrl = null
    if (token && thumbFileId) {
      thumbUrl = await getTelegramFileUrl(token, thumbFileId)
    }
    // Fallback to emoji glyph if resolution fails
    if (!thumbUrl || !thumbUrl.startsWith('http')) {
      thumbUrl = sticker.emoji || '🖼'
    }

    console.debug('[StickerSubPanel] sticker selected:', {
      key,
      file_unique_id: sticker.file_unique_id,
      thumbFileId,
      thumbUrl,
      emoji: sticker.emoji,
    })

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

    // Go back to main menu after selecting
    onBack()
  }

  return (
    <div className="subpanel" style={{ minWidth: 300, padding: '0.25rem 0' }}>
      <p className="subpanel-title" style={{ padding: '0 0.5rem 0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <span>✈️</span> Stickers de Telegram
      </p>
      <div ref={anchorRef} style={{ height: 0 }} />
      <StickerPanel
        anchorRef={anchorRef}
        onSelect={handleStickerSelect}
        onClose={onBack}
      />
    </div>
  )
}

function AssigneePanel({ value, onChange }) {
  const [draft, setDraft] = useState(value || '')
  return (
    <div className="subpanel">
      <p className="subpanel-title">Asignar a</p>
      <input className="form-input" value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder="Nombre del asignado..." autoFocus />
      <button className="btn-sm-primary" style={{ marginTop: '0.5rem' }}
        onClick={() => onChange(draft.trim())}>Asignar</button>
    </div>
  )
}
