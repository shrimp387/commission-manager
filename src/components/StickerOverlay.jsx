/**
 * StickerOverlay — pegatinas posicionables sobre la tarjeta.
 *
 * Props:
 *   reactions      — mapa de reacciones del task
 *   onChange       — callback para actualizar reactions en el store
 *   editMode       — bool: si true, activa modo arrastrar
 *   localPositions — { [key]: {x,y} } posiciones locales durante edición (desde el padre)
 *   onMoveLocal    — (key, x, y) => void — llamado en drag-end para actualizar padre
 *
 * El padre (KanbanCard) es dueño del estado de posiciones locales.
 * El commit al store lo hace el padre cuando el usuario presiona "Listo".
 */
import { useState, useRef, useCallback, useEffect } from 'react'

function hashStr(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function defaultRot(key) {
  return ((hashStr(key) % 22) - 11)
}

// ── Single sticker chip ───────────────────────────────────────────────────────
function StickerChip({ stickerKey, val, index, editMode, containerRef, localPos, onDelete, onMoveLocal }) {
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const videoRef = useRef(null)
  const chipRef = useRef(null)
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  const thumbUrl = typeof val === 'object' ? val.thumbUrl : val
  const isHttp = typeof thumbUrl === 'string' && thumbUrl.startsWith('http')
  const isVideo = !!(val.is_video && isHttp)
  const rot = val.rot ?? defaultRot(stickerKey)

  // Use localPos (dragging) > saved in store > hash-based default
  const xPct = localPos?.x ?? val.x ?? (5 + (hashStr(stickerKey) % 60))
  const yPct = localPos?.y ?? val.y ?? (5 + ((hashStr(stickerKey) * 7) % 55))
  const hasPosition = localPos !== undefined || val.x !== undefined

  // ── Video hover ───────────────────────────────────────────────────────────
  const handleMouseEnter = useCallback(() => {
    setHovered(true)
    if (isVideo && videoRef.current && !pinned) videoRef.current.play().catch(() => {})
  }, [isVideo, pinned])

  const handleMouseLeave = useCallback(() => {
    setHovered(false)
    if (isVideo && videoRef.current && !pinned) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
  }, [isVideo, pinned])

  const handleDoubleClick = useCallback((e) => {
    e.stopPropagation()
    if (editMode) return
    if (!isVideo) return
    const next = !pinned
    setPinned(next)
    if (videoRef.current) {
      if (next) videoRef.current.play().catch(() => {})
      else { videoRef.current.pause(); videoRef.current.currentTime = 0 }
    }
  }, [isVideo, pinned, editMode])

  // ── Drag ──────────────────────────────────────────────────────────────────
  const onMoveLocalRef = useRef(onMoveLocal)
  useEffect(() => { onMoveLocalRef.current = onMoveLocal }, [onMoveLocal])

  const startDrag = useCallback((clientX, clientY) => {
    if (!editMode || !containerRef?.current || !chipRef.current) return
    dragging.current = true
    const chipRect = chipRef.current.getBoundingClientRect()
    dragOffset.current = { x: clientX - chipRect.left, y: clientY - chipRect.top }
    let lastX, lastY

    function onMove(e) {
      if (!dragging.current) return
      const cx = e.touches ? e.touches[0].clientX : e.clientX
      const cy = e.touches ? e.touches[0].clientY : e.clientY
      const cRect = containerRef.current.getBoundingClientRect()
      const chipW = chipRef.current.offsetWidth
      const chipH = chipRef.current.offsetHeight
      lastX = (Math.max(0, Math.min(cx - dragOffset.current.x - cRect.left, cRect.width - chipW)) / cRect.width) * 100
      lastY = (Math.max(0, Math.min(cy - dragOffset.current.y - cRect.top, cRect.height - chipH)) / cRect.height) * 100
      chipRef.current.style.left = lastX + '%'
      chipRef.current.style.top = lastY + '%'
    }

    function onUp() {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onUp)
      if (lastX !== undefined) onMoveLocalRef.current(stickerKey, lastX, lastY)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onUp)
  }, [editMode, containerRef, stickerKey])

  const handlePointerDown = useCallback((e) => {
    if (!editMode) return
    e.preventDefault()
    e.stopPropagation()
    startDrag(e.touches ? e.touches[0].clientX : e.clientX, e.touches ? e.touches[0].clientY : e.clientY)
  }, [editMode, startDrag])

  // ── Style ─────────────────────────────────────────────────────────────────
  const useAbsolute = editMode || hasPosition
  const style = useAbsolute
    ? { position: 'absolute', left: xPct + '%', top: yPct + '%', transform: `rotate(${rot}deg)`, zIndex: hovered ? 999 : 10 + index, cursor: editMode ? 'grab' : 'default', touchAction: editMode ? 'none' : 'auto', marginRight: 0 }
    : { transform: `rotate(${rot}deg)`, zIndex: 10 + index }

  return (
    <div
      ref={chipRef}
      className={['sticker-overlay-chip', hovered && 'sticker-overlay-chip--hovered', pinned && 'sticker-overlay-chip--pinned', editMode && 'sticker-overlay-chip--edit'].filter(Boolean).join(' ')}
      style={style}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handlePointerDown}
      onTouchStart={handlePointerDown}
      title={editMode ? 'Arrastra para reposicionar' : pinned ? 'Doble clic para pausar' : isVideo ? 'Hover: animar · Doble clic: fijar' : (val.emoji ?? 'sticker')}
      role="img"
      aria-label={val.emoji ? `Sticker ${val.emoji}` : 'Sticker'}
    >
      {isVideo
        ? <video ref={videoRef} src={thumbUrl} loop muted playsInline preload="metadata" className="sticker-overlay-media" />
        : isHttp
          ? <img src={thumbUrl} alt={val.emoji ?? 'sticker'} className="sticker-overlay-media" draggable={false} />
          : <span className="sticker-overlay-fallback" aria-hidden="true">{thumbUrl}</span>
      }
      {pinned && !editMode && <span className="sticker-overlay-pinned-dot" aria-hidden="true">●</span>}
      <button
        className="sticker-overlay-delete"
        onClick={(e) => { e.stopPropagation(); onDelete(stickerKey) }}
        onMouseDown={e => e.stopPropagation()}
        aria-label="Quitar sticker"
        tabIndex={(hovered || editMode) ? 0 : -1}
      >×</button>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function StickerOverlay({ reactions, onChange, editMode = false, localPositions = {}, onMoveLocal }) {
  const containerRef = useRef(null)

  if (!reactions) return null

  const stickerEntries = Object.entries(reactions).filter(
    ([k, v]) => k.startsWith('__sticker__') && v && (v.count > 0 || typeof v === 'string')
  )
  if (stickerEntries.length === 0 && !editMode) return null

  const allPositioned = stickerEntries.every(([k, v]) =>
    localPositions[k] !== undefined || v.x !== undefined
  )

  function handleDelete(key) {
    const updated = { ...reactions }
    delete updated[key]
    onChange(updated)
  }

  return (
    <div
      ref={containerRef}
      className={['sticker-overlay-container', editMode && 'sticker-overlay-container--edit', allPositioned && !editMode && 'sticker-overlay-container--positioned'].filter(Boolean).join(' ')}
      aria-label={editMode ? 'Modo edición — arrastra para mover' : 'Stickers pegados'}
    >
      {stickerEntries.map(([key, val], index) => (
        <StickerChip
          key={key}
          stickerKey={key}
          val={val}
          index={index}
          editMode={editMode}
          containerRef={containerRef}
          localPos={localPositions[key]}
          onDelete={handleDelete}
          onMoveLocal={onMoveLocal ?? (() => {})}
        />
      ))}
      {editMode && stickerEntries.length === 0 && (
        <p className="sticker-overlay-empty-edit">Agrega stickers con 🎭 y muévelos aquí</p>
      )}
    </div>
  )
}
