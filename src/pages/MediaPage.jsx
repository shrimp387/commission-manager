/**
 * MediaPage — Medios de comunicación del estudio.
 * Muestra todos los canales activos y permite agregar links de redes sociales.
 */
import React, { useState, useEffect } from 'react'
import { isGmailConnected, getGmailTokens } from '../utils/gmail.js'
import { getTelegramConfig } from '../utils/telegram.js'
import { getConfig, setConfig } from '../store/appConfig.js'

const SOCIAL_PRESETS = [
  { id: 'twitter',   icon: '🐦', label: 'Twitter/X',    placeholder: 'https://twitter.com/usuario' },
  { id: 'instagram', icon: '📸', label: 'Instagram',     placeholder: 'https://instagram.com/usuario' },
  { id: 'deviantart',icon: '🎨', label: 'DeviantArt',    placeholder: 'https://deviantart.com/usuario' },
  { id: 'furaffinity',icon:'🦊', label: 'FurAffinity',   placeholder: 'https://furaffinity.net/user/usuario' },
  { id: 'artstation', icon:'🖼', label: 'ArtStation',    placeholder: 'https://artstation.com/usuario' },
  { id: 'kofi',       icon:'☕', label: 'Ko-fi',          placeholder: 'https://ko-fi.com/usuario' },
  { id: 'patreon',    icon:'🎭', label: 'Patreon',        placeholder: 'https://patreon.com/usuario' },
  { id: 'bluesky',    icon:'🌐', label: 'Bluesky',        placeholder: 'https://bsky.app/profile/usuario' },
  { id: 'telegram',   icon:'✈️', label: 'Telegram (canal)',placeholder: 'https://t.me/canal' },
]

function ChannelCard({ icon, label, status, detail, action }) {
  return (
    <div style={{
      background: 'var(--surface2)', borderRadius: 'var(--radius-sm)',
      padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.875rem',
    }}>
      <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>{label}</p>
        <p style={{ margin: 0, fontSize: '0.72rem', color: status === 'active' ? 'var(--green)' : 'var(--text-muted)' }}>
          {status === 'active' ? '● Activo' : '○ No configurado'}{detail ? ` · ${detail}` : ''}
        </p>
      </div>
      {action}
    </div>
  )
}

export default function MediaPage() {
  const [gmailOk, setGmailOk] = useState(false)
  const [gmailEmail, setGmailEmail] = useState(null)
  const [tgOk, setTgOk] = useState(false)
  const [socials, setSocials] = useState({})
  const [editId, setEditId] = useState(null)
  const [editVal, setEditVal] = useState('')

  useEffect(() => {
    setGmailOk(isGmailConnected())
    const tokens = getGmailTokens()
    setGmailEmail(tokens?.userEmail ?? null)
    const cfg = getTelegramConfig()
    setTgOk(!!(cfg?.token && cfg?.chatId))
    const config = getConfig()
    setSocials(config.socialLinks ?? {})
  }, [])

  function saveSocial(id, val) {
    const updated = { ...socials, [id]: val }
    setSocials(updated)
    setConfig('socialLinks', updated)
    setEditId(null)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-bg" aria-hidden="true" style={{ background: 'linear-gradient(135deg, rgba(96,165,250,0.1) 0%, transparent 60%)' }} />
        <div className="page-header-content">
          <div className="page-header-brand">
            <div className="page-header-icon">💬</div>
            <div>
              <p className="page-header-eyebrow">COMUNICACIÓN</p>
              <h1 className="page-header-title">Medios de comunicación</h1>
              <p className="page-header-sub">Todos tus canales activos en un solo lugar.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Canales activos */}
        <section>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
            Canales de notificación
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <ChannelCard icon="📧" label="Gmail" status={gmailOk ? 'active' : 'inactive'}
              detail={gmailEmail}
              action={<a href="/#/connections" style={{ fontSize: '0.75rem', color: 'var(--green)' }}>{gmailOk ? 'Gestionar' : 'Conectar →'}</a>}
            />
            <ChannelCard icon="✈️" label="Telegram Bot" status={tgOk ? 'active' : 'inactive'}
              detail={tgOk ? 'Notificaciones activas' : null}
              action={<a href="/#/connections" style={{ fontSize: '0.75rem', color: 'var(--green)' }}>{tgOk ? 'Gestionar' : 'Configurar →'}</a>}
            />
          </div>
        </section>

        {/* Redes sociales */}
        <section>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
            Redes sociales y portafolio online
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.5rem' }}>
            {SOCIAL_PRESETS.map(s => {
              const val = socials[s.id] || ''
              const isEditing = editId === s.id
              return (
                <div key={s.id} style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '1rem' }}>{s.icon}</span>
                    <span style={{ fontWeight: 600, fontSize: '0.82rem', flex: 1 }}>{s.label}</span>
                    {val && !isEditing && (
                      <a href={val} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: 'var(--green)' }}>↗</a>
                    )}
                  </div>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input className="form-input" style={{ flex: 1, fontSize: '0.78rem', padding: '0.3rem 0.5rem' }}
                        value={editVal} onChange={e => setEditVal(e.target.value)}
                        placeholder={s.placeholder} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') saveSocial(s.id, editVal.trim()); if (e.key === 'Escape') setEditId(null) }}
                      />
                      <button className="btn-primary" style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem' }} onClick={() => saveSocial(s.id, editVal.trim())}>✓</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditId(s.id); setEditVal(val) }}
                      style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.3rem 0.5rem', cursor: 'pointer', textAlign: 'left', fontSize: '0.72rem', color: val ? 'var(--text)' : 'var(--text-dim)' }}>
                      {val || s.placeholder}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
