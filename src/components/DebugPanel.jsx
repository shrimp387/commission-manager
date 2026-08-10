/**
 * DebugPanel — botón flotante de diagnóstico.
 * Visible SIEMPRE cuando hay usuario logueado (producción + local).
 * También se activa con ?debug=1 para usuarios sin sesión.
 */
import React, { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext.jsx'
import StorageMonitor from './StorageMonitor.jsx'

const TRACKED_KEYS = [
  'task_fields',
  'local_tasks',
  'commission_requests',
  'app_config',
  'portfolio_items',
  'archived_commissions',
  '_current_user_id',
]

function getSize(key) {
  const val = localStorage.getItem(key)
  if (!val) return null
  const bytes = new Blob([val]).size
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  if (bytes > 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return bytes + ' B'
}

function countItems(key) {
  try {
    const val = JSON.parse(localStorage.getItem(key))
    if (Array.isArray(val)) return val.length + ' items'
    if (val && typeof val === 'object') return Object.keys(val).length + ' keys'
    return '1'
  } catch { return '?' }
}

export default function DebugPanel() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [showMonitor, setShowMonitor] = useState(false)
  const [snap, setSnap] = useState({})

  // Visible cuando hay usuario logueado O en localhost O con ?debug=1
  const isVisible =
    !!user ||
    window.location.hostname === 'localhost' ||
    window.location.search.includes('debug=1') ||
    window.location.hash.includes('debug=1')

  useEffect(() => {
    if (!open) return
    const refresh = () => {
      const s = {}
      TRACKED_KEYS.forEach(k => {
        s[k] = { size: getSize(k), count: countItems(k) }
      })
      setSnap(s)
    }
    refresh()
    const t = setInterval(refresh, 2000)
    return () => clearInterval(t)
  }, [open])

  if (!isVisible) return null

  const storedUid = localStorage.getItem('_current_user_id')
  const mismatch = user && storedUid && storedUid !== user.id

  return (
    <div style={{
      position: 'fixed', bottom: 12, right: 12, zIndex: 9999,
      fontFamily: 'monospace', fontSize: 11,
    }}>
      {/* Botón principal — siempre visible cuando hay sesión */}
      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        {/* Botón directo al Storage Monitor */}
        <button
          onClick={() => setShowMonitor(true)}
          title="Storage Monitor — ver qué hay en Supabase, R2 y localStorage"
          style={{
            background: '#0d1f2d', color: '#38bdf8',
            border: '1px solid #38bdf840', borderRadius: 6,
            padding: '4px 10px', cursor: 'pointer', fontWeight: 700, fontSize: 11,
          }}
        >
          🗄 Storage
        </button>

        {/* Botón debug completo */}
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            background: mismatch ? '#ef4444' : '#1a1a1a',
            color: mismatch ? '#000' : '#888',
            border: '1px solid #333', borderRadius: 6,
            padding: '4px 8px', cursor: 'pointer', fontWeight: 700, fontSize: 11,
          }}
          title="Panel de debug"
        >
          🔍 {mismatch ? '⚠' : ''}
        </button>
      </div>

      {open && (
        <div style={{
          marginTop: 6, background: '#111', border: '1px solid #333',
          borderRadius: 8, padding: '10px 14px', minWidth: 320, maxWidth: 400,
          maxHeight: '60vh', overflowY: 'auto',
        }}>
          <p style={{ color: '#888', margin: '0 0 8px' }}>
            👤 Auth user: <span style={{ color: user ? '#22c55e' : '#ef4444' }}>
              {user ? `${user.email} (${user.id.slice(0, 8)}…)` : 'no session'}
            </span>
          </p>
          <p style={{ color: '#888', margin: '0 0 12px' }}>
            💾 LS user: <span style={{ color: storedUid ? '#60a5fa' : '#888' }}>
              {storedUid ? storedUid.slice(0, 8) + '…' : 'none'}
            </span>
            {mismatch && <span style={{ color: '#ef4444' }}> ← MISMATCH!</span>}
          </p>

          <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '8px 0' }} />

          {TRACKED_KEYS.filter(k => k !== '_current_user_id').map(key => {
            const info = snap[key]
            const exists = !!localStorage.getItem(key)
            return (
              <div key={key} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '3px 0', borderBottom: '1px solid #1e1e1e',
                color: exists ? '#e8e8ec' : '#555',
              }}>
                <span>{key}</span>
                <span style={{ color: '#888' }}>
                  {exists ? `${info?.count ?? '?'} · ${info?.size ?? '?'}` : '—'}
                </span>
              </div>
            )
          })}

          <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
            <button
              onClick={() => { const s = {}; TRACKED_KEYS.forEach(k => { s[k] = { size: getSize(k), count: countItems(k) } }); setSnap(s) }}
              style={{ background: '#222', color: '#888', border: '1px solid #333', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 10 }}
            >
              ↻ Refresh
            </button>
            <button
              onClick={() => {
                TRACKED_KEYS.forEach(k => localStorage.removeItem(k))
                setSnap({})
              }}
              style={{ background: '#3a1515', color: '#ef4444', border: '1px solid #ef444440', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 10 }}
            >
              🗑 Clear LS
            </button>
          </div>
        </div>
      )}

      {showMonitor && <StorageMonitor onClose={() => setShowMonitor(false)} />}
    </div>
  )
}
