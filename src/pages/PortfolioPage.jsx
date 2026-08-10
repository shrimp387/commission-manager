import React, { useState, useEffect, useRef } from 'react'
import { getPortfolio, savePortfolio } from '../lib/db.js'
import { uploadToR2, deleteFromR2, isR2Available } from '../lib/r2.js'
import { supabase } from '../lib/supabase.js'
import { getCurrentUserId } from '../lib/db.js'
import { useAuth } from '../lib/AuthContext.jsx'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

/**
 * Lists all files under userId/portfolio/ in R2 and builds portfolio items.
 * This is the recovery path when Supabase metadata is lost but R2 files exist.
 */
async function reconstructPortfolioFromR2(userId) {
  if (!WORKER_URL || !userId) return []
  try {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (!token) return []

    const res = await fetch(`${WORKER_URL}/list/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return []

    const json = await res.json()
    const files = (json.objects ?? []).filter(f => f.key?.includes('/portfolio/'))

    return files.map(f => {
      const name = f.key.split('/').pop() ?? f.key
      return {
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        url: `${WORKER_URL}/file/${f.key}`,
        storageKey: f.key,
        backend: 'r2',
        title: name.replace(/\.[^.]+$/, '').replace(/^\d+_[a-z0-9]+_/, ''),
        description: '',
        tags: [],
        createdAt: f.uploaded ?? new Date().toISOString(),
      }
    })
  } catch (e) {
    console.warn('[portfolio] reconstructFromR2 error:', e)
    return []
  }
}

function PortfolioItem({ item, index, onEdit, onDelete, onOpen, onDragStart, onDragOver, onDrop }) {
  const [hover, setHover] = useState(false)

  return (
    <div
      className="portfolio-item"
      draggable
      onDragStart={e => onDragStart(e, index)}
      onDragOver={e => { e.preventDefault(); onDragOver(index) }}
      onDrop={e => onDrop(e, index)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        className="portfolio-img-btn"
        onClick={() => onOpen(index)}
        aria-label={`Ver ${item.title}`}
      >
        <img src={item.url} alt={item.title} className="portfolio-img" loading="lazy" />
      </button>

      {hover && (
        <div className="portfolio-overlay">
          <p className="portfolio-title">{item.title || 'Sin título'}</p>
          <div className="portfolio-overlay-actions">
            <button className="overlay-btn" onClick={() => onEdit(index)} aria-label="Editar">✏</button>
            <button className="overlay-btn overlay-btn--danger" onClick={() => onDelete(index)} aria-label="Eliminar">🗑</button>
          </div>
        </div>
      )}

      {item.tags?.length > 0 && (
        <div className="portfolio-tags">
          {item.tags.slice(0, 3).map(tag => (
            <span key={tag} className="portfolio-tag">{tag}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function EditModal({ item, onSave, onClose }) {
  const [title, setTitle] = useState(item?.title || '')
  const [description, setDescription] = useState(item?.description || '')
  const [tagsRaw, setTagsRaw] = useState(item?.tags?.join(', ') || '')

  function handleSave() {
    onSave({
      title: title.trim(),
      description: description.trim(),
      tags: tagsRaw.split(',').map(t => t.trim()).filter(Boolean),
    })
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel">
        <div className="modal-header">
          <h2 className="modal-title">Editar imagen</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Título</label>
            <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Título de la obra" />
          </div>
          <div className="form-group">
            <label className="form-label">Descripción</label>
            <textarea className="form-textarea" value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción opcional..." rows={3} />
          </div>
          <div className="form-group">
            <label className="form-label">Tags (separados por coma)</label>
            <input className="form-input" value={tagsRaw} onChange={e => setTagsRaw(e.target.value)} placeholder="retrato, digital, fanart" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave}>Guardar cambios</button>
        </div>
      </div>
    </div>
  )
}

function Lightbox({ items, index, onClose, onPrev, onNext }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const item = items[index]
  if (!item) return null

  return (
    <div className="lightbox-overlay" onClick={e => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="Visor de imagen">
      <button className="lightbox-close" onClick={onClose} aria-label="Cerrar visor">×</button>
      <button className="lightbox-prev" onClick={onPrev} aria-label="Imagen anterior">‹</button>
      <div className="lightbox-content">
        <img src={item.url} alt={item.title} className="lightbox-img" />
        {item.title && <p className="lightbox-title">{item.title}</p>}
        <p className="lightbox-counter">{index + 1} / {items.length}</p>
      </div>
      <button className="lightbox-next" onClick={onNext} aria-label="Imagen siguiente">›</button>
    </div>
  )
}

export default function PortfolioPage() {
  const [items, setItems] = useState([])
  const [editIndex, setEditIndex] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [activeTag, setActiveTag] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [dragIndex, setDragIndex] = useState(null)
  const [uploadWarning, setUploadWarning] = useState(null) // null | 'base64' | 'ok'
  const [syncing, setSyncing] = useState(false)
  const fileInputRef = useRef(null)
  const { user } = useAuth()

  // ── Load portfolio — 3-layer fallback: Supabase → localStorage → R2 reconstruction ──
  useEffect(() => {
    if (!user?.id) {
      setItems(JSON.parse(localStorage.getItem('portfolio_items') || '[]'))
      return
    }

    async function loadPortfolio() {
      // 1. Supabase (source of truth after first sync)
      const dbItems = await getPortfolio().catch(() => [])
      if (dbItems && dbItems.length > 0) {
        setItems(dbItems)
        localStorage.setItem('portfolio_items', JSON.stringify(dbItems))
        return
      }

      // 2. localStorage cache (non-base64 items only)
      const lsItems = JSON.parse(localStorage.getItem('portfolio_items') || '[]')
        .filter(i => !i.url?.startsWith('data:'))
      if (lsItems.length > 0) {
        setItems(lsItems)
        savePortfolio(lsItems).catch(() => {})
        return
      }

      // 3. Reconstruct from R2 — builds metadata from actual files in the bucket
      setSyncing(true)
      try {
        const r2Items = await reconstructPortfolioFromR2(user.id)
        if (r2Items.length > 0) {
          setItems(r2Items)
          await savePortfolio(r2Items)
          localStorage.setItem('portfolio_items', JSON.stringify(r2Items))
        }
      } catch (e) {
        console.warn('[portfolio] R2 reconstruction failed:', e)
      } finally {
        setSyncing(false)
      }
    }

    loadPortfolio()
  }, [user?.id])

  async function save(updated) {
    setItems(updated)
    await savePortfolio(updated)
  }

  async function handleFiles(files) {
    const userId = user?.id || getCurrentUserId()
    const newImgs = await Promise.all(
      Array.from(files)
        .filter(f => f.type.startsWith('image/'))
        .map(async file => {
          // Try R2 first
          if (isR2Available(userId)) {
            const result = await uploadToR2(file, 'portfolio', null, userId)
            if (result) return {
              id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              url: result.url,
              storageKey: result.key,
              backend: 'r2',
              title: file.name.replace(/\.[^.]+$/, ''),
              description: '',
              tags: [],
              createdAt: new Date().toISOString(),
            }
          }

          // Fallback: Supabase Storage
          if (supabase && userId) {
            const ext = file.name.split('.').pop()
            const path = `${userId}/portfolio/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
            const { error } = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type })
            if (!error) {
              const { data: signed } = await supabase.storage.from('attachments').createSignedUrl(path, 60 * 60 * 24 * 365)
              return {
                id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                url: signed?.signedUrl || '',
                storageKey: path,
                backend: 'supabase',
                title: file.name.replace(/\.[^.]+$/, ''),
                description: '',
                tags: [],
                createdAt: new Date().toISOString(),
              }
            }
          }

          // Final fallback: base64
          console.warn('[portfolio] R2 y Supabase Storage fallaron — usando base64. La imagen no persistirá entre builds.')
          const base64Result = await new Promise(resolve => {
            const r = new FileReader()
            r.onload = e => resolve({
              id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              url: e.target.result,
              storageKey: null,
              backend: 'base64',
              title: file.name.replace(/\.[^.]+$/, ''),
              description: '',
              tags: [],
              createdAt: new Date().toISOString(),
            })
            r.readAsDataURL(file)
          })
          return { ...base64Result, _isBase64Fallback: true }
        })
    )

    const hasBase64 = newImgs.some(img => img._isBase64Fallback)
    if (hasBase64) {
      setUploadWarning('base64')
      setTimeout(() => setUploadWarning(null), 8000)
    } else {
      setUploadWarning('ok')
      setTimeout(() => setUploadWarning(null), 3000)
    }

    // Strip internal flag before saving
    save([...items, ...newImgs.map(({ _isBase64Fallback, ...img }) => img)])
  }

  function handleDelete(index) {
    if (!confirm('¿Eliminar esta imagen del portafolio?')) return
    const item = items[index]
    if (item.storageKey) {
      if (item.backend === 'r2') deleteFromR2(item.storageKey)
      else if (item.backend === 'supabase' && supabase) supabase.storage.from('attachments').remove([item.storageKey])
    }
    save(items.filter((_, i) => i !== index))
  }

  function handleEditSave(meta) {
    save(items.map((item, i) => i === editIndex ? { ...item, ...meta } : item))
    setEditIndex(null)
  }

  // Drag & drop reorder
  function handleDragStart(e, index) {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }
  function handleDragOver(index) { /* highlight */ }
  function handleDrop(e, targetIndex) {
    e.preventDefault()
    if (dragIndex === null || dragIndex === targetIndex) return
    const updated = [...items]
    const [moved] = updated.splice(dragIndex, 1)
    updated.splice(targetIndex, 0, moved)
    save(updated)
    setDragIndex(null)
  }

  // Tags
  const allTags = [...new Set(items.flatMap(i => i.tags || []))]
  const filtered = activeTag ? items.filter(i => i.tags?.includes(activeTag)) : items

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-bg page-header-bg--purple" aria-hidden="true" />
        <div className="page-header-content">
          <div className="page-header-brand">
            <div className="page-header-icon" aria-hidden="true">🖼</div>
            <div>
              <p className="page-header-eyebrow">GALERÍA</p>
              <h1 className="page-header-title">Portafolio</h1>
              <p className="page-header-sub">Tu colección de obras para mostrar al mundo.</p>
            </div>
          </div>
          <button className="btn-primary" onClick={() => fileInputRef.current?.click()}>
            + Subir imagen
          </button>
        </div>
      </div>

      <div className="page-body">

        {/* Syncing from R2 banner */}
        {syncing && (
          <div role="status" style={{
            background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.3)',
            borderRadius: 'var(--radius-sm)', padding: '0.65rem 0.875rem',
            marginBottom: '0.75rem', fontSize: '0.78rem', color: '#93c5fd',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <span className="mini-spinner" style={{ display: 'inline-block', width: 14, height: 14, borderWidth: 2 }} />
            Recuperando imágenes desde Cloudflare R2...
          </div>
        )}

        {/* Upload status banner */}
        {uploadWarning === 'base64' && (
          <div role="alert" style={{
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 'var(--radius-sm)', padding: '0.65rem 0.875rem',
            marginBottom: '0.75rem', fontSize: '0.78rem', color: '#fca5a5',
          }}>
            <strong>⚠ La imagen NO se subió a R2.</strong> Se guardó en modo base64 local — se perderá con el próximo deploy.<br/>
            <span style={{ color: 'rgba(252,165,165,0.7)' }}>
              Causa probable: no hay sesión activa de Google. Cierra sesión y vuelve a iniciar para que el upload a R2 funcione.
            </span>
          </div>
        )}
        {uploadWarning === 'ok' && (
          <div role="status" style={{
            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 'var(--radius-sm)', padding: '0.65rem 0.875rem',
            marginBottom: '0.75rem', fontSize: '0.78rem', color: '#86efac',
          }}>
            ✓ Imagen subida a Cloudflare R2 correctamente.
          </div>
        )}

        {/* Tag filter */}
        {allTags.length > 0 && (
          <div className="tag-filter" role="group" aria-label="Filtrar por tag">
            <button
              className={`tag-chip ${!activeTag ? 'tag-chip--active' : ''}`}
              onClick={() => setActiveTag(null)}
            >Todas</button>
            {allTags.map(tag => (
              <button
                key={tag}
                className={`tag-chip ${activeTag === tag ? 'tag-chip--active' : ''}`}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                aria-pressed={activeTag === tag}
              >{tag}</button>
            ))}
          </div>
        )}

        {/* Drop zone or gallery */}
        {filtered.length === 0 ? (
          <div
            className={`portfolio-dropzone ${dragOver ? 'drop-zone--active' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Zona de carga de portafolio"
          >
            <span className="drop-zone-icon" aria-hidden="true">🖼</span>
            <h3>Tu portafolio está vacío</h3>
            <p>Arrastra imágenes aquí o haz clic para subir</p>
            <p className="drop-zone-hint">PNG, JPG, WEBP, GIF</p>
          </div>
        ) : (
          <>
            {/* Upload area at top */}
            <div
              className={`portfolio-upload-strip ${dragOver ? 'drop-zone--active' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
            >
              + Agregar más imágenes (arrastra o haz clic)
            </div>

            {/* Masonry grid */}
            <div className="masonry-grid">
              {filtered.map((item, i) => (
                <PortfolioItem
                  key={item.id}
                  item={item}
                  index={i}
                  onOpen={setLightboxIndex}
                  onEdit={setEditIndex}
                  onDelete={handleDelete}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                />
              ))}
            </div>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={e => handleFiles(e.target.files)}
          aria-hidden="true"
        />
      </div>

      {editIndex !== null && (
        <EditModal
          item={items[editIndex]}
          onSave={handleEditSave}
          onClose={() => setEditIndex(null)}
        />
      )}

      {lightboxIndex !== null && (
        <Lightbox
          items={filtered}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex(i => Math.max(0, i - 1))}
          onNext={() => setLightboxIndex(i => Math.min(filtered.length - 1, i + 1))}
        />
      )}
    </div>
  )
}
