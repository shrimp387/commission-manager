/**
 * GlobalSearch — buscador global Ctrl-K / Cmd-K
 *
 * Busca en tiempo real en:
 *  - Tareas activas (nombre, cliente)
 *  - Portafolio (título, tags)
 *  - Solicitudes de comisión (nombre, email)
 *  - Archivados (nombre, cliente)
 *  - Páginas de la app
 */
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { getAllTasks as getAllLocalTasks } from '../store/localTasksDb.js'
import { getTaskFields } from '../store/taskStore.js'
import { getArchived } from '../store/archiveDb.js'

const PAGES = [
  { id: 'studio',     label: 'Estudio de Comisiones', icon: '🔭', desc: 'Tablero principal' },
  { id: 'requests',   label: 'Solicitudes de Comisión', icon: '📋', desc: 'Gestión de clientes' },
  { id: 'archived',   label: 'Archivados', icon: '🗂', desc: 'Historial de comisiones' },
  { id: 'portfolio',  label: 'Galería de Portafolio', icon: '🖼', desc: 'Tus obras' },
  { id: 'guide',      label: 'Guía del Estudio', icon: '📖', desc: 'Políticas y procesos' },
  { id: 'connections',label: 'Conexiones', icon: '🔌', desc: 'Telegram y Gmail' },
  { id: 'settings',   label: 'Configuración', icon: '⚙️', desc: 'Apariencia y perfil' },
]

function buildSearchIndex() {
  const results = []

  // Pages
  PAGES.forEach(p => {
    results.push({ type: 'page', id: p.id, title: p.label, subtitle: p.desc, icon: p.icon, navigateTo: p.id })
  })

  // Active tasks
  try {
    const tasks = getAllLocalTasks()
    tasks.forEach(t => {
      if (!t.text) return
      const fields = getTaskFields(t.id)
      const client = fields?.client || ''
      const stage = fields?.stage || ''
      results.push({
        type: 'task',
        id: t.id,
        title: t.text,
        subtitle: client ? `Cliente: ${client}` : `Tarea activa · ${stage || 'nueva'}`,
        icon: '🎨',
        navigateTo: 'studio',
        meta: { client, stage },
      })
    })
  } catch {}

  // Commission requests
  try {
    const requests = JSON.parse(localStorage.getItem('commission_requests') || '[]')
    requests.forEach(r => {
      results.push({
        type: 'request',
        id: r.id,
        title: r.name || r.artworkType || 'Solicitud',
        subtitle: `${r.email || ''} · ${r.status === 'pending' ? 'Pendiente' : r.status === 'accepted' ? 'Aceptada' : 'Rechazada'}`,
        icon: '📥',
        navigateTo: 'requests',
      })
    })
  } catch {}

  // Archived
  try {
    const archived = getArchived()
    archived.forEach(a => {
      results.push({
        type: 'archived',
        id: a.id,
        title: a.text,
        subtitle: `Archivada · ${a.client || ''}`,
        icon: '🗂',
        navigateTo: 'archived',
      })
    })
  } catch {}

  // Portfolio
  try {
    const portfolio = JSON.parse(localStorage.getItem('portfolio_items') || '[]')
    portfolio.forEach(p => {
      results.push({
        type: 'portfolio',
        id: p.id,
        title: p.title || p.url?.split('/').pop() || 'Imagen',
        subtitle: p.tags?.length ? p.tags.join(', ') : 'Portafolio',
        icon: '🖼',
        url: p.url,
        navigateTo: 'portfolio',
      })
    })
  } catch {}

  return results
}

function highlight(text, query) {
  if (!query || !text) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(96,165,250,0.25)', color: 'inherit', borderRadius: 2 }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function GlobalSearch({ onNavigate, onClose }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const index = useMemo(() => buildSearchIndex(), [])

  const results = useMemo(() => {
    if (!query.trim()) return PAGES.map(p => ({ type: 'page', id: p.id, title: p.label, subtitle: p.desc, icon: p.icon, navigateTo: p.id }))
    const q = query.toLowerCase()
    return index.filter(item =>
      item.title?.toLowerCase().includes(q) ||
      item.subtitle?.toLowerCase().includes(q)
    ).slice(0, 10)
  }, [query, index])

  useEffect(() => {
    setSelected(0)
  }, [query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected(s => Math.min(s + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected(s => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      if (results[selected]) confirm(results[selected])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  function confirm(item) {
    if (item.navigateTo) onNavigate(item.navigateTo)
    onClose()
  }

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selected]
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const typeLabel = { page: 'Página', task: 'Tarea', request: 'Solicitud', archived: 'Archivada', portfolio: 'Portafolio' }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '10vh',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', width: 'min(600px, 92vw)',
        boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', gap: '0.5rem' }}>
          <span style={{ fontSize: '1rem', flexShrink: 0 }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar tareas, solicitudes, portafolio, páginas..."
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: '1rem', padding: 0,
            }}
            aria-label="Búsqueda global"
            aria-expanded="true"
            role="combobox"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem' }}
            >×</button>
          )}
          <kbd style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          style={{ maxHeight: '60vh', overflowY: 'auto' }}
          role="listbox"
        >
          {results.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Sin resultados para "{query}"
            </div>
          )}

          {!query && (
            <p style={{ padding: '0.5rem 1rem 0', fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Páginas
            </p>
          )}
          {query && results.length > 0 && (
            <p style={{ padding: '0.5rem 1rem 0', fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {results.length} resultado{results.length !== 1 ? 's' : ''}
            </p>
          )}

          {results.map((item, i) => (
            <button
              key={item.id || i}
              role="option"
              aria-selected={i === selected}
              onClick={() => confirm(item)}
              onMouseEnter={() => setSelected(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                width: '100%', padding: '0.65rem 1rem', textAlign: 'left',
                background: i === selected ? 'var(--surface2)' : 'none',
                border: 'none', borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.04))',
                cursor: 'pointer', color: 'var(--text)',
              }}
            >
              <span style={{ fontSize: '1.1rem', flexShrink: 0, width: 24, textAlign: 'center' }}>{item.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: i === selected ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {highlight(item.title, query)}
                </p>
                {item.subtitle && (
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {highlight(item.subtitle, query)}
                  </p>
                )}
              </div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', flexShrink: 0, background: 'var(--surface2)', padding: '2px 6px', borderRadius: 4 }}>
                {typeLabel[item.type] ?? item.type}
              </span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '1rem', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
          <span>↑↓ navegar</span>
          <span>↵ abrir</span>
          <span>Esc cerrar</span>
        </div>
      </div>
    </div>
  )
}
