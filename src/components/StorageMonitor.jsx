/**
 * StorageMonitor — Panel de diagnóstico de almacenamiento.
 */
import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { getCurrentUserId, savePortfolio } from '../lib/db.js'
import { uploadToR2, isR2Available } from '../lib/r2.js'
import { useAuth } from '../lib/AuthContext.jsx'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

// ── Helpers ────────────────────────────────────────────────────────────────

function bytes(n) {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function ago(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })
}

// ── Supabase table fetcher ────────────────────────────────────────────────

async function fetchSupabaseData(userId) {
  if (!supabase || !userId) return null
  const results = {}

  const tables = [
    { key: 'profiles',              label: 'Perfil / Config',   icon: '⚙️' },
    { key: 'tasks',                 label: 'Tareas (campos)',   icon: '📋' },
    { key: 'commission_requests',   label: 'Solicitudes',       icon: '📥' },
    { key: 'portfolio_items',       label: 'Portafolio (meta)', icon: '🖼' },
    { key: 'archived_commissions',  label: 'Archivados',        icon: '🗂' },
    { key: 'studio_guide',          label: 'Guía del estudio',  icon: '📖' },
    { key: 'kanban_config',         label: 'Config Kanban',     icon: '🗃' },
  ]

  await Promise.all(tables.map(async ({ key, label, icon }) => {
    try {
      const { data, error } = await supabase
        .from(key)
        .select('*')
        .eq(key === 'profiles' ? 'id' : 'user_id', userId)
      results[key] = { label, icon, rows: data ?? [], error: error?.message }
    } catch (e) {
      results[key] = { label, icon, rows: [], error: e.message }
    }
  }))

  return results
}

// ── R2 file lister (via Worker list endpoint) ─────────────────────────────

async function fetchR2Files(userId) {
  if (!WORKER_URL || !userId) return null
  try {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (!token) return { error: 'Sin sesión activa' }

    const res = await fetch(`${WORKER_URL}/list/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 404) return { files: [], note: 'Endpoint /list no disponible — agrega el endpoint al Worker' }
    if (!res.ok) return { error: `Worker respondió ${res.status}` }
    const json = await res.json()
    return { files: json.objects ?? json.files ?? [] }
  } catch (e) {
    return { error: e.message }
  }
}

// ── Base64 cleanup ────────────────────────────────────────────────────────

function scanBase64Attachments() {
  try {
    const fields = JSON.parse(localStorage.getItem('task_fields') || '{}')
    const results = []
    for (const [taskId, data] of Object.entries(fields)) {
      const attachments = data.attachments || []
      const base64Atts = attachments.filter(a => a.url?.startsWith('data:'))
      if (base64Atts.length > 0) {
        const size = base64Atts.reduce((s, a) => s + (a.url?.length ?? 0), 0)
        results.push({ taskId, total: attachments.length, base64Count: base64Atts.length, size })
      }
    }
    return results
  } catch { return [] }
}

function purgeBase64FromTaskFields() {
  try {
    const fields = JSON.parse(localStorage.getItem('task_fields') || '{}')
    let freed = 0
    for (const taskId of Object.keys(fields)) {
      const atts = fields[taskId].attachments || []
      const before = JSON.stringify(atts).length
      const clean = atts.filter(a => !a.url?.startsWith('data:'))
      freed += before - JSON.stringify(clean).length
      fields[taskId].attachments = clean
    }
    localStorage.setItem('task_fields', JSON.stringify(fields))
    return freed
  } catch { return 0 }
}

// ── localStorage inspector ────────────────────────────────────────────────

function getLocalStorageSnapshot() {
  const items = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    const raw = localStorage.getItem(key)
    let size = raw?.length ?? 0
    let parsed = null
    let count = null
    try {
      parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) count = parsed.length
      else if (typeof parsed === 'object' && parsed !== null) count = Object.keys(parsed).length
    } catch {}
    items.push({ key, size, count, isExpected: isExpectedKey(key) })
  }
  return items.sort((a, b) => b.size - a.size)
}

const EXPECTED_LS_KEYS = new Set([
  'app_config', 'task_fields', 'local_tasks', 'commission_requests',
  'portfolio_items', 'studio_guide', 'kanban_custom_sections',
  'kanban_order', 'kanban_colors', 'kanban_labels', 'page_backgrounds',
  'stickers', 'archived_commissions', 'gmail_tokens', '_current_user_id',
])

function isExpectedKey(key) {
  if (EXPECTED_LS_KEYS.has(key)) return true
  // Supabase auth token — normal, stored by Supabase JS SDK
  if (/^sb-.+-auth-token$/.test(key)) return true
  // user-scoped backups like local_tasks_<uuid>
  if (/^(local_tasks|task_fields|archived_commissions)_[a-f0-9-]{36}$/.test(key)) return true
  return false
}

// ── Sub-components ────────────────────────────────────────────────────────

function SectionHeader({ icon, title, count, color = 'var(--green)', action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
      <span style={{ fontSize: '1.1rem' }}>{icon}</span>
      <span style={{ fontWeight: 700, color, flex: 1 }}>{title}</span>
      {count !== undefined && (
        <span style={{ fontSize: '0.7rem', background: 'var(--surface2)', padding: '0.1rem 0.5rem', borderRadius: 99, color: 'var(--text-muted)' }}>
          {count}
        </span>
      )}
      {action}
    </div>
  )
}

function SupabaseTab({ data, loading, error }) {
  if (loading) return <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Cargando datos de Supabase...</p>
  if (error) return <p style={{ color: 'var(--red)', fontSize: '0.8rem' }}>⚠ {error}</p>
  if (!data) return <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sin datos. ¿Hay sesión activa?</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {Object.entries(data).map(([key, { label, icon, rows, error: rowErr }]) => (
        <div key={key} style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: '0.6rem 0.8rem' }}>
          <SectionHeader
            icon={icon}
            title={label}
            count={`${rows.length} fila${rows.length !== 1 ? 's' : ''}`}
            color={rowErr ? 'var(--red)' : 'var(--text)'}
          />
          {rowErr && <p style={{ fontSize: '0.72rem', color: 'var(--red)' }}>⚠ {rowErr}</p>}
          {rows.length === 0 && !rowErr && (
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Tabla vacía para este usuario</p>
          )}
          {rows.length > 0 && (
            <details>
              <summary style={{ fontSize: '0.72rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                Ver datos ({rows.length})
              </summary>
              <pre style={{
                fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '0.4rem',
                maxHeight: 160, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {JSON.stringify(rows, null, 2)}
              </pre>
            </details>
          )}
        </div>
      ))}
    </div>
  )
}

function R2Tab({ data, loading, error }) {
  if (loading) return <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Consultando R2...</p>
  if (error) return (
    <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)', padding: '0.6rem 0.8rem', fontSize: '0.8rem', color: 'var(--red)' }}>
      ⚠ {error}
    </div>
  )
  if (!data) return <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sin datos</p>

  if (data.note) return (
    <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-sm)', padding: '0.75rem', fontSize: '0.8rem', color: 'var(--orange)' }}>
      <p style={{ fontWeight: 700, marginBottom: '0.3rem' }}>⚠ Endpoint /list no disponible en el Worker</p>
      <p style={{ fontSize: '0.72rem' }}>{data.note}</p>
      <p style={{ fontSize: '0.72rem', marginTop: '0.4rem' }}>
        Agrega el handler GET /list/:userId al Worker para habilitar esta vista.
        Mientras tanto puedes ver los archivos en el dashboard de Cloudflare R2.
      </p>
    </div>
  )

  const files = data.files ?? []

  const grouped = files.reduce((acc, f) => {
    const parts = f.key?.split('/') ?? []
    const folder = parts.length >= 3 ? parts[1] : 'raíz'
    if (!acc[folder]) acc[folder] = []
    acc[folder].push(f)
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {files.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No hay archivos en R2 para este usuario</p>
      )}
      {Object.entries(grouped).map(([folder, items]) => (
        <div key={folder} style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: '0.6rem 0.8rem' }}>
          <SectionHeader
            icon={folder === 'portfolio' ? '🖼' : folder === 'attachments' ? '📎' : folder === 'backgrounds' ? '🏞' : '📁'}
            title={folder}
            count={`${items.length} archivo${items.length !== 1 ? 's' : ''}`}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {items.map(f => {
              const name = f.key?.split('/').pop() ?? f.key
              const isImg = /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(name)
              const workerUrl = `${WORKER_URL}/file/${f.key}`
              return (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {isImg ? (
                    <img src={workerUrl} alt={name} style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)', flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 32, textAlign: 'center' }}>📄</span>
                  )}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <span style={{ flexShrink: 0, color: 'var(--text-dim)' }}>{bytes(f.size)}</span>
                  <span style={{ flexShrink: 0, color: 'var(--text-dim)' }}>{ago(f.uploaded)}</span>
                  <a href={workerUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green)', flexShrink: 0 }}>↗</a>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function LocalStorageTab({ items, onClearKey, onRefresh }) {
  const leaks = items.filter(i => !i.isExpected)
  const expected = items.filter(i => i.isExpected)
  const totalSize = items.reduce((s, i) => s + i.size, 0)

  // Base64 analysis
  const [base64Info, setBase64Info] = useState(() => scanBase64Attachments())
  const [purgeResult, setPurgeResult] = useState(null)

  const totalBase64 = base64Info.reduce((s, r) => s + r.size, 0)

  function handlePurge() {
    if (!confirm(`¿Eliminar ${base64Info.reduce((s,r)=>s+r.base64Count,0)} adjuntos base64 del localStorage? Los archivos que están en R2 no se verán afectados.`)) return
    const freed = purgeBase64FromTaskFields()
    setPurgeResult(freed)
    setBase64Info(scanBase64Attachments())
    onRefresh?.()
  }

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.75rem', fontSize: '0.72rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>Total: </span>
          <span style={{ color: totalSize > 500000 ? 'var(--red)' : 'var(--text)' }}>{bytes(totalSize)}</span>
        </div>
        <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.75rem', fontSize: '0.72rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>Claves: </span>
          <span>{items.length}</span>
        </div>
        {leaks.length > 0 && (
          <div style={{ background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.75rem', fontSize: '0.72rem', color: 'var(--red)' }}>
            ⚠ {leaks.length} claves inesperadas
          </div>
        )}
      </div>

      {/* Base64 cleanup panel */}
      {base64Info.length > 0 && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 'var(--radius-sm)', padding: '0.75rem', marginBottom: '0.75rem',
        }}>
          <p style={{ fontWeight: 700, color: 'var(--red)', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
            🗑 Imágenes base64 detectadas en task_fields ({bytes(totalBase64)})
          </p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Son adjuntos de tareas guardados localmente en base64. Si ya están en R2 o Supabase, pueden eliminarse del localStorage con seguridad.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '0.5rem' }}>
            {base64Info.map(r => (
              <div key={r.taskId} style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                • tarea <span style={{ color: 'var(--text)' }}>{r.taskId.slice(0, 12)}…</span> — {r.base64Count} imagen{r.base64Count !== 1 ? 'es' : ''} base64 ({bytes(r.size)})
              </div>
            ))}
          </div>
          <button
            onClick={handlePurge}
            style={{
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 'var(--radius-sm)', padding: '0.35rem 0.75rem',
              cursor: 'pointer', fontSize: '0.75rem', color: '#fca5a5',
            }}
          >
            🧹 Limpiar imágenes base64 del localStorage
          </button>
          {purgeResult !== null && (
            <p style={{ fontSize: '0.7rem', color: 'var(--green)', marginTop: '0.35rem' }}>
              ✓ Liberados {bytes(purgeResult)}. Recarga para ver el nuevo tamaño.
            </p>
          )}
        </div>
      )}
      {base64Info.length === 0 && purgeResult !== null && (
        <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 'var(--radius-sm)', padding: '0.6rem 0.75rem', marginBottom: '0.75rem', fontSize: '0.75rem', color: 'var(--green)' }}>
          ✓ Sin imágenes base64 en localStorage. Todo limpio.
        </div>
      )}

      {/* Leaks */}
      {leaks.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <p style={{ fontSize: '0.72rem', color: 'var(--red)', fontWeight: 700, marginBottom: '0.3rem' }}>
            🔴 Claves NO esperadas (posibles fugas):
          </p>
          {leaks.map(item => (
            <LsRow key={item.key} item={item} onClear={onClearKey} highlight="red" />
          ))}
        </div>
      )}

      {/* Expected — warn if large base64 images */}
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.3rem' }}>
        Claves conocidas (caché local):
      </p>
      {expected.length === 0 && (
        <p style={{ fontSize: '0.72rem', color: 'var(--green)' }}>✓ Sin datos locales. Todo está en la nube.</p>
      )}
      {expected.map(item => {
        // Flag base64 images stored locally — they should be in R2
        const hasBase64 = false // would need to parse — skip for perf
        return <LsRow key={item.key} item={item} onClear={onClearKey} highlight={item.size > 100000 ? 'orange' : null} />
      })}
    </div>
  )
}

function LsRow({ item, onClear, highlight }) {
  const [expanded, setExpanded] = useState(false)
  const raw = localStorage.getItem(item.key) ?? ''

  const color = highlight === 'red' ? 'var(--red)' : highlight === 'orange' ? 'var(--orange)' : 'var(--text-muted)'

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', marginBottom: '0.2rem', fontSize: '0.7rem', color }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, width: 14, flexShrink: 0 }}
      >
        {expanded ? '▾' : '▸'}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.key}</span>
          <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>{bytes(item.size)}</span>
          {item.count !== null && <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>({item.count} items)</span>}
          {highlight === 'orange' && <span style={{ color: 'var(--orange)', flexShrink: 0 }}>⚠ grande</span>}
        </div>
        {expanded && (
          <pre style={{ fontSize: '0.62rem', color: 'var(--text-dim)', maxHeight: 100, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: '0.25rem' }}>
            {raw.length > 2000 ? raw.slice(0, 2000) + '…' : raw}
          </pre>
        )}
      </div>
      <button
        onClick={() => onClear(item.key)}
        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--red)', padding: '0.1rem 0.4rem', flexShrink: 0, fontSize: '0.65rem' }}
        title="Limpiar esta clave"
      >
        ✕
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export default function StorageMonitor({ onClose }) {
  const { user } = useAuth()
  const userId = user?.id || getCurrentUserId()

  const [tab, setTab] = useState('supabase')

  // Supabase state
  const [sbData, setSbData] = useState(null)
  const [sbLoading, setSbLoading] = useState(false)
  const [sbError, setSbError] = useState(null)

  // R2 state
  const [r2Data, setR2Data] = useState(null)
  const [r2Loading, setR2Loading] = useState(false)
  const [r2Error, setR2Error] = useState(null)

  // LS state
  const [lsItems, setLsItems] = useState(() => getLocalStorageSnapshot())

  const refreshSupabase = useCallback(async () => {
    setSbLoading(true)
    setSbError(null)
    try {
      const data = await fetchSupabaseData(userId)
      setSbData(data)
      if (!data) setSbError('Sin sesión o Supabase no disponible')
    } catch (e) {
      setSbError(e.message)
    } finally {
      setSbLoading(false)
    }
  }, [userId])

  const refreshR2 = useCallback(async () => {
    setR2Loading(true)
    setR2Error(null)
    try {
      const data = await fetchR2Files(userId)
      if (data?.error) setR2Error(data.error)
      else setR2Data(data)
    } catch (e) {
      setR2Error(e.message)
    } finally {
      setR2Loading(false)
    }
  }, [userId])

  const refreshLS = useCallback(() => {
    setLsItems(getLocalStorageSnapshot())
  }, [])

  // Auto-load on tab change
  useEffect(() => {
    if (tab === 'supabase' && !sbData && !sbLoading) refreshSupabase()
    if (tab === 'r2' && !r2Data && !r2Loading) refreshR2()
  }, [tab])

  function clearLsKey(key) {
    if (!confirm(`¿Eliminar localStorage["${key}"]?`)) return
    localStorage.removeItem(key)
    refreshLS()
  }

  const tabs = [
    { id: 'supabase', label: '🗄 Supabase', badge: sbData ? Object.values(sbData).reduce((s, t) => s + t.rows.length, 0) : null },
    { id: 'r2',       label: '☁ R2 / Cloudflare', badge: r2Data?.files?.length ?? null },
    { id: 'ls',       label: '💾 LocalStorage', badge: lsItems.length, warn: lsItems.filter(i => !i.isExpected).length > 0 },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={e => e.target === e.currentTarget && onClose?.()}
    >
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', width: 'min(720px, 96vw)', maxHeight: '88vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.1rem' }}>🔍</span>
          <span style={{ fontWeight: 700, flex: 1 }}>Storage Monitor</span>
          {!userId && (
            <span style={{ fontSize: '0.72rem', color: 'var(--orange)', background: 'rgba(245,158,11,0.1)', padding: '0.2rem 0.5rem', borderRadius: 99 }}>
              Sin sesión
            </span>
          )}
          {userId && (
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              uid: {userId.slice(0, 8)}…
            </span>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem', padding: '0 0.2rem' }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: '0.5rem 0.25rem', background: 'none',
                border: 'none', borderBottom: tab === t.id ? '2px solid var(--green)' : '2px solid transparent',
                color: tab === t.id ? 'var(--green)' : 'var(--text-muted)',
                cursor: 'pointer', fontSize: '0.78rem', fontWeight: tab === t.id ? 700 : 400,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
              }}
            >
              {t.label}
              {t.badge !== null && (
                <span style={{
                  fontSize: '0.62rem', background: t.warn ? 'var(--red)' : 'var(--surface2)',
                  color: t.warn ? '#fff' : 'var(--text-muted)',
                  padding: '0.1rem 0.4rem', borderRadius: 99,
                }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
          <button
            onClick={() => {
              if (tab === 'supabase') refreshSupabase()
              else if (tab === 'r2') refreshR2()
              else refreshLS()
            }}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.25rem 0.75rem', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text)' }}
          >
            ↻ Actualizar
          </button>

          {tab === 'supabase' && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Datos estructurados — config, tareas, solicitudes, portafolio (metadatos)
            </span>
          )}
          {tab === 'r2' && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Archivos binarios — imágenes de portafolio y adjuntos
            </span>
          )}
          {tab === 'ls' && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Caché local — debería estar vacío cuando hay sesión activa
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem' }}>
          {tab === 'supabase' && <SupabaseTab data={sbData} loading={sbLoading} error={sbError} />}
          {tab === 'r2'       && <R2Tab data={r2Data} loading={r2Loading} error={r2Error} />}
          {tab === 'ls'       && <LocalStorageTab items={lsItems} onClearKey={clearLsKey} onRefresh={refreshLS} />}
        </div>

        {/* Footer */}
        <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid var(--border)', fontSize: '0.68rem', color: 'var(--text-dim)', display: 'flex', gap: '1rem' }}>
          <span>🗄 Supabase → datos estructurados (config, tareas, meta)</span>
          <span>☁ R2 → imágenes y archivos binarios</span>
          <span>💾 localStorage → solo caché offline temporal</span>
        </div>
      </div>
    </div>
  )
}
