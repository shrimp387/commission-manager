import React, { useState, useRef, useEffect, useCallback } from 'react'
import { setConfig, getConfig } from '../store/appConfig.js'

const PAGE_LABELS = {
  studio: 'Estudio',
  requests: 'Solicitudes',
  portfolio: 'Galería',
  guide: 'Guía',
  settings: 'Configuración',
}

export default function PageBackgroundEditor({ pageId, initialBackground, onSave, onClose }) {
  const [imageDataUrl, setImageDataUrl] = useState(initialBackground?.url || null)
  const [error, setError] = useState(null)
  const [transform, setTransform] = useState(
    initialBackground?.transform || { x: 0, y: 0, scale: 1.0 }
  )
  const [opacity, setOpacity] = useState(initialBackground?.opacity ?? 0.85)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, tx: 0, ty: 0 })

  const canvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const imgRef = useRef(null)  // loaded HTMLImageElement

  const CANVAS_W = 600
  const CANVAS_H = 360

  // Load image into imgRef when imageDataUrl changes
  useEffect(() => {
    if (!imageDataUrl) return
    const img = new Image()
    img.onload = () => { imgRef.current = img; drawCanvas() }
    img.src = imageDataUrl
  }, [imageDataUrl])

  // Redraw canvas whenever transform changes
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !imgRef.current) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
    const img = imgRef.current
    const { x, y, scale } = transform
    const drawW = img.naturalWidth * scale
    const drawH = img.naturalHeight * scale
    const cx = CANVAS_W / 2 + x
    const cy = CANVAS_H / 2 + y
    ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH)
  }, [transform])

  useEffect(() => { drawCanvas() }, [drawCanvas])

  // File input handler — acepta cualquier tamaño, reescala si es necesario
  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const accepted = ['image/jpeg','image/png','image/webp','image/gif']
    if (!accepted.includes(file.type)) {
      setError('Formato no soportado. Usa JPEG, PNG, WebP o GIF.')
      return
    }
    setError(null)
    const reader = new FileReader()
    reader.onload = ev => {
      // Reescalar la imagen a máx 1920×1080 antes de mostrarla en el editor
      // para que el canvas y localStorage no exploten con imágenes enormes
      const img = new Image()
      img.onload = () => {
        const MAX_W = 1920
        const MAX_H = 1080
        let { naturalWidth: w, naturalHeight: h } = img
        if (w > MAX_W || h > MAX_H) {
          const ratio = Math.min(MAX_W / w, MAX_H / h)
          w = Math.round(w * ratio)
          h = Math.round(h * ratio)
        }
        const tmp = document.createElement('canvas')
        tmp.width = w
        tmp.height = h
        tmp.getContext('2d').drawImage(img, 0, 0, w, h)
        const resized = tmp.toDataURL('image/jpeg', 0.9)
        setImageDataUrl(resized)
        setTransform({ x: 0, y: 0, scale: 1.0 })
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }

  // Mouse drag — pan
  function handleMouseDown(e) {
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y })
  }
  function handleMouseMove(e) {
    if (!isDragging) return
    setTransform(t => ({
      ...t,
      x: dragStart.tx + (e.clientX - dragStart.x),
      y: dragStart.ty + (e.clientY - dragStart.y),
    }))
  }
  function handleMouseUp() { setIsDragging(false) }

  // Wheel — zoom
  function handleWheel(e) {
    e.preventDefault()
    setTransform(t => ({
      ...t,
      scale: Math.max(0.1, Math.min(5.0, t.scale - e.deltaY * 0.001)),
    }))
  }

  // Computed output resolution
  const outW = imageDataUrl && imgRef.current
    ? Math.round(imgRef.current.naturalWidth / transform.scale)
    : 0
  const outH = imageDataUrl && imgRef.current
    ? Math.round(imgRef.current.naturalHeight / transform.scale)
    : 0

  const pageLabel = PAGE_LABELS[pageId] || pageId

  function handleSave() {
    if (!imageDataUrl || !imgRef.current) return

    setError(null)

    // Render current view to offscreen canvas
    const offscreen = document.createElement('canvas')
    offscreen.width = CANVAS_W
    offscreen.height = CANVAS_H
    const ctx2 = offscreen.getContext('2d')
    const img = imgRef.current
    const { x, y, scale } = transform
    const drawW = img.naturalWidth * scale
    const drawH = img.naturalHeight * scale
    const cx = CANVAS_W / 2 + x
    const cy = CANVAS_H / 2 + y
    ctx2.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH)

    // Intentar guardar comprimiendo iterativamente hasta que quepa en localStorage
    // Empieza en calidad 0.82 y baja de 0.1 en 0.1 hasta 0.2
    const qualities = [0.82, 0.72, 0.60, 0.45, 0.30, 0.20]
    let saved = false

    for (const q of qualities) {
      const dataUrl = offscreen.toDataURL('image/jpeg', q)
      try {
        setConfig('sectionBgs', { ...getConfig().sectionBgs, [pageId]: { url: dataUrl, transform, opacity } })
        onSave({ url: dataUrl, transform, opacity })
        saved = true
        break
      } catch (e) {
        const isQuota = e.name === 'QuotaExceededError' ||
          (e instanceof DOMException && e.code === 22)
        if (!isQuota) throw e
        // Sigue intentando con menor calidad
      }
    }

    if (!saved) {
      // Último recurso: canvas más pequeño (mitad de resolución)
      const small = document.createElement('canvas')
      small.width = Math.round(CANVAS_W / 2)
      small.height = Math.round(CANVAS_H / 2)
      small.getContext('2d').drawImage(offscreen, 0, 0, small.width, small.height)
      const dataUrl = small.toDataURL('image/jpeg', 0.5)
      try {
        setConfig('sectionBgs', { ...getConfig().sectionBgs, [pageId]: { url: dataUrl, transform, opacity } })
        onSave({ url: dataUrl, transform, opacity })
        saved = true
      } catch {
        setError('No hay espacio suficiente en el navegador. Borra otros fondos en Configuración e inténtalo de nuevo.')
        return
      }
    }

    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel bg-editor-panel">
        <div className="modal-header">
          <h2 className="modal-title">Editor de fondo — {pageLabel}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <div className="modal-body">
          {!imageDataUrl ? (
            <>
              <button className="btn-outline" onClick={() => fileInputRef.current?.click()}>
                📁 Subir imagen
              </button>
              {error && <p className="form-error">{error}</p>}
            </>
          ) : (
            <>
              <canvas
                ref={canvasRef}
                className="bg-editor-canvas"
                width={CANVAS_W}
                height={CANVAS_H}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
              />
              <div className="bg-editor-controls">
                <label className="settings-label">
                  Zoom ({transform.scale.toFixed(2)}×)
                  <input
                    type="range" min="0.1" max="5.0" step="0.05"
                    value={transform.scale}
                    onChange={e => setTransform(t => ({ ...t, scale: parseFloat(e.target.value) }))}
                    className="settings-range"
                  />
                </label>
                <label className="settings-label">
                  Opacidad del overlay oscuro ({Math.round((1 - opacity) * 100)}%)
                  <input
                    type="range" min="0" max="1" step="0.05"
                    value={1 - opacity}
                    onChange={e => setOpacity(1 - parseFloat(e.target.value))}
                    className="settings-range"
                  />
                </label>
                {outW > 0 && (
                  <p className="bg-editor-resolution">Resolución de salida: {outW} × {outH} px</p>
                )}
                {error && <p className="form-error">{error}</p>}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          {imageDataUrl && (
            <button className="btn-outline" onClick={() => fileInputRef.current?.click()}>
              Cambiar imagen
            </button>
          )}
          <button
            className="btn-primary"
            disabled={!imageDataUrl}
            onClick={handleSave}
          >
            Guardar fondo
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={handleFileChange}
        />
      </div>
    </div>
  )
}
