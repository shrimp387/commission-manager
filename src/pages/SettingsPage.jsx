import React, { useState, useRef, useEffect } from 'react'
import { getConfig, setConfig, setConfigMulti } from '../store/appConfig.js'
import { useConfig } from '../hooks/useConfig.js'
import PageBackgroundEditor from '../components/PageBackgroundEditor.jsx'
import StorageMonitor from '../components/StorageMonitor.jsx'
import {
  isGmailConnected,
  getGmailTokens,
  openGoogleOAuth,
  clearGmailTokens,
} from '../utils/gmail.js'
import {
  getTelegramConfig,
  saveTelegramConfig,
  testTelegramConnection,
} from '../utils/telegram.js'
import { getTelegramConfig as getTelegramConfigDb } from '../lib/db.js'

const FONTS = [
  { label: 'Inter (default)', value: 'Inter' },
  { label: 'Roboto', value: 'Roboto' },
  { label: 'Nunito', value: 'Nunito' },
  { label: 'Playfair Display', value: 'Playfair Display' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono' },
  { label: 'Comic Sans', value: 'Comic Sans MS' },
]

const ACCENT_PRESETS = [
  '#22C55E','#3B82F6','#F59E0B','#EF4444','#EC4899',
  '#8B5CF6','#14B8A6','#F97316','#06B6D4','#84CC16',
  '#ffffff','#a3a3a3',
]

const FONT_SIZES = [12, 13, 14, 15, 16, 17, 18]

const PAGE_BG_ENTRIES = [
  { id: 'studio',    label: 'Estudio',         icon: '🔭' },
  { id: 'requests',  label: 'Solicitudes',      icon: '📋' },
  { id: 'portfolio', label: 'Galería',          icon: '🖼' },
  { id: 'guide',     label: 'Guía',             icon: '📖' },
  { id: 'settings',  label: 'Configuración',    icon: '⚙' },
]

export default function SettingsPage() {
  const config = useConfig()
  const [tab, setTab] = useState('project')
  const [bgEditorPage, setBgEditorPage] = useState(null)
  const [showStorageMonitor, setShowStorageMonitor] = useState(false)
  const bannerRef = useRef(null)
  const iconRef = useRef(null)
  const bgRef = useRef(null)
  
  // Connection testing state
  const [hfTokenInput, setHfTokenInput] = useState(config.hfToken || '')
  const [mistralKeyInput, setMistralKeyInput] = useState(config.mistralApiKey || '')
  const [testingHF, setTestingHF] = useState(false)
  const [testingMistral, setTestingMistral] = useState(false)
  const [hfTestResult, setHfTestResult] = useState(null)
  const [mistralTestResult, setMistralTestResult] = useState(null)

  // Gmail state
  const [gmailConnected, setGmailConnected] = useState(false)
  const [gmailEmail, setGmailEmail] = useState(null)

  // Telegram state
  const [tgToken, setTgToken] = useState('')
  const [tgChatId, setTgChatId] = useState('')
  const [tgTesting, setTgTesting] = useState(false)
  const [tgResult, setTgResult] = useState(null)
  const [tgSaved, setTgSaved] = useState(false)

  // Update input fields when config changes
  useEffect(() => {
    setHfTokenInput(config.hfToken || '')
    setMistralKeyInput(config.mistralApiKey || '')
  }, [config.hfToken, config.mistralApiKey])

  // Load Gmail connection status
  useEffect(() => {
    const connected = isGmailConnected()
    setGmailConnected(connected)
    if (connected) {
      const tokens = getGmailTokens()
      setGmailEmail(tokens?.userEmail ?? null)
    }
  }, [])

  // Load Telegram config
  useEffect(() => {
    async function loadTgConfig() {
      // Try localStorage first (fast)
      const cached = getTelegramConfig()
      if (cached?.token) {
        setTgToken(cached.token)
        setTgChatId(cached.chatId || '')
        return
      }
      // Fallback to Supabase
      const dbCfg = await getTelegramConfigDb()
      if (dbCfg?.token) {
        setTgToken(dbCfg.token)
        setTgChatId(dbCfg.chatId || '')
      }
    }
    loadTgConfig()
  }, [])

  // Test HuggingFace connection
  async function testHuggingFaceConnection() {
    if (!hfTokenInput || !hfTokenInput.startsWith('hf_')) {
      setHfTestResult({ ok: false, message: '❌ Token inválido. Debe empezar con hf_' })
      setTimeout(() => setHfTestResult(null), 5000)
      return
    }

    if (hfTokenInput.length < 20) {
      setHfTestResult({ ok: false, message: '❌ Token muy corto. Verifica que copiaste el token completo' })
      setTimeout(() => setHfTestResult(null), 5000)
      return
    }

    setTestingHF(true)
    setHfTestResult(null)

    // Simulate test delay for UX
    await new Promise(resolve => setTimeout(resolve, 800))

    // Since HuggingFace API has CORS restrictions from browser,
    // we can't test directly. Just validate format and save.
    setHfTestResult({ 
      ok: true, 
      message: '✅ Token válido (formato correcto). Se probará al generar tags.' 
    })
    
    setTestingHF(false)
    setTimeout(() => setHfTestResult(null), 5000)
  }

  // Test Mistral connection
  async function testMistralConnection() {
    if (!mistralKeyInput) {
      setMistralTestResult({ ok: false, message: 'API Key vacía' })
      setTimeout(() => setMistralTestResult(null), 5000)
      return
    }

    setTestingMistral(true)
    setMistralTestResult(null)

    try {
      // Test with list models endpoint (cheap, doesn't consume credits)
      const response = await fetch('https://api.mistral.ai/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${mistralKeyInput}`
        }
      })

      if (response.ok) {
        setMistralTestResult({ ok: true, message: '✅ Conexión exitosa con Mistral AI' })
      } else if (response.status === 401) {
        setMistralTestResult({ ok: false, message: '❌ API Key inválida' })
      } else {
        setMistralTestResult({ ok: false, message: `❌ Error HTTP ${response.status}` })
      }
    } catch (err) {
      setMistralTestResult({ ok: false, message: `❌ Error de red: ${err.message}` })
    } finally {
      setTestingMistral(false)
      setTimeout(() => setMistralTestResult(null), 5000)
    }
  }

  // Save HuggingFace token
  function saveHuggingFaceToken() {
    setConfig('hfToken', hfTokenInput.trim())
    setHfTestResult({ ok: true, message: '✅ Token guardado correctamente' })
    setTimeout(() => setHfTestResult(null), 3000)
  }

  // Save Mistral key
  function saveMistralKey() {
    setConfig('mistralApiKey', mistralKeyInput.trim())
    setMistralTestResult({ ok: true, message: '✅ API Key guardada correctamente' })
    setTimeout(() => setMistralTestResult(null), 3000)
  }

  // Gmail handlers
  function handleDisconnectGmail() {
    if (!confirm('¿Desconectar Google? Se eliminarán los tokens guardados.')) return
    clearGmailTokens()
    setGmailConnected(false)
    setGmailEmail(null)
  }

  // Telegram handlers
  function handleSaveTelegram() {
    saveTelegramConfig(tgToken.trim(), tgChatId.trim())
    setTgSaved(true)
    setTgResult(null)
    setTimeout(() => setTgSaved(false), 2500)
  }

  async function handleTestTelegram() {
    if (!tgToken.trim() || !tgChatId.trim()) return
    setTgTesting(true)
    setTgResult(null)
    const res = await testTelegramConnection(tgToken.trim(), tgChatId.trim())
    setTgResult(res)
    setTgTesting(false)
  }

  function readFile(file, onResult) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => {
      // Reescalar a máx 1920×1080 antes de guardar para evitar QuotaExceededError
      const img = new Image()
      img.onload = () => {
        const MAX_W = 1920
        const MAX_H = 1080
        let w = img.naturalWidth
        let h = img.naturalHeight
        if (w > MAX_W || h > MAX_H) {
          const ratio = Math.min(MAX_W / w, MAX_H / h)
          w = Math.round(w * ratio)
          h = Math.round(h * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)

        // Comprimir iterativamente hasta que quepa en localStorage
        const qualities = [0.82, 0.65, 0.45, 0.25]
        for (const q of qualities) {
          try {
            const dataUrl = canvas.toDataURL('image/jpeg', q)
            onResult(dataUrl)
            return
          } catch { /* sigue */ }
        }
        // Si todo falla, intenta con canvas de mitad de tamaño
        const small = document.createElement('canvas')
        small.width = Math.round(w / 2)
        small.height = Math.round(h / 2)
        small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height)
        onResult(small.toDataURL('image/jpeg', 0.5))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-bg" aria-hidden="true" />
        <div className="page-header-content">
          <div className="page-header-brand">
            <div className="page-header-icon">⚙</div>
            <div>
              <p className="page-header-eyebrow">PERSONALIZACIÓN</p>
              <h1 className="page-header-title">Configuración</h1>
              <p className="page-header-sub">Personaliza la apariencia de tu estudio.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Tab bar */}
        <div className="tab-bar">
          {[
            { id: 'project', label: '🏷 Proyecto' },
            { id: 'appearance', label: '🎨 Apariencia' },
            { id: 'background', label: '🖼 Fondo' },
            { id: 'typography', label: 'Aa Tipografía' },
            { id: 'pageBgs', label: '🖼 Fondos de página' },
            { id: 'connections', label: '🔌 Conexiones' },
            { id: 'storage', label: '🗄 Storage' },
          ].map(t => (
            <button key={t.id} className={`tab-btn ${tab === t.id ? 'tab-btn--active' : ''}`}
              onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {/* PROJECT TAB */}
        {tab === 'project' && (
          <div className="settings-section">
            <h2 className="settings-h2">Identidad del proyecto</h2>

            {/* Banner */}
            <div className="settings-banner-preview"
              style={config.projectBannerUrl ? { backgroundImage: `url(${config.projectBannerUrl})` } : {}}>
              <div className="settings-banner-overlay">
                <button className="settings-banner-btn" onClick={() => bannerRef.current?.click()}>
                  {config.projectBannerUrl ? '🖼 Cambiar banner' : '+ Agregar banner'}
                </button>
                {config.projectBannerUrl && (
                  <button className="settings-banner-btn settings-banner-btn--remove"
                    onClick={() => setConfig('projectBannerUrl', '')}>✕ Quitar</button>
                )}
              </div>
            </div>
            <input ref={bannerRef} type="file" accept="image/*" className="sr-only"
              onChange={e => readFile(e.target.files[0], url => setConfig('projectBannerUrl', url))} />

            {/* Icon */}
            <div className="settings-row">
              <label className="settings-label">Ícono del proyecto</label>
              <div className="settings-icon-row">
                <div className="settings-icon-preview">{config.projectIcon}</div>
                <input className="form-input settings-emoji-input"
                  value={config.projectIcon}
                  onChange={e => setConfig('projectIcon', e.target.value)}
                  placeholder="🔭" maxLength={4} />
                <span className="settings-hint">Pega un emoji o texto corto</span>
              </div>
            </div>

            {/* Name */}
            <div className="settings-row">
              <label className="settings-label">Nombre del estudio</label>
              <input className="form-input"
                value={config.projectName}
                onChange={e => setConfig('projectName', e.target.value)}
                placeholder="Estudio de Comisiones" />
            </div>

            {/* Subtitle */}
            <div className="settings-row">
              <label className="settings-label">Subtítulo</label>
              <input className="form-input"
                value={config.projectSubtitle}
                onChange={e => setConfig('projectSubtitle', e.target.value)}
                placeholder="De la idea a la entrega" />
            </div>
          </div>
        )}

        {/* APPEARANCE TAB */}
        {tab === 'appearance' && (
          <div className="settings-section">
            <h2 className="settings-h2">Color de acento</h2>
            <p className="settings-desc">Se aplica a checkboxes, pills, botones y el sidebar activo.</p>

            <div className="color-presets">
              {ACCENT_PRESETS.map(color => (
                <button
                  key={color}
                  className={`color-swatch ${config.accentColor === color ? 'color-swatch--active' : ''}`}
                  style={{ background: color }}
                  onClick={() => setConfig('accentColor', color)}
                  aria-label={`Color ${color}`}
                  title={color}
                />
              ))}
            </div>

            <div className="settings-row" style={{ marginTop: '1rem' }}>
              <label className="settings-label">Color personalizado</label>
              <div className="settings-color-row">
                <input type="color" className="settings-color-input"
                  value={config.accentColor}
                  onChange={e => setConfig('accentColor', e.target.value)} />
                <input className="form-input settings-hex-input"
                  value={config.accentColor}
                  onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setConfig('accentColor', e.target.value) }}
                  placeholder="#22C55E" />
              </div>
            </div>

            <div className="settings-preview-bar" style={{ background: config.accentColor }}>
              Vista previa del color de acento
            </div>
          </div>
        )}

        {/* BACKGROUND TAB */}
        {tab === 'background' && (
          <div className="settings-section">
            <h2 className="settings-h2">Imagen de fondo global</h2>
            <p className="settings-desc">Se aplica a toda la aplicación detrás del contenido.</p>

            <div className="settings-bg-preview"
              style={config.globalBgUrl ? {
                backgroundImage: `url(${config.globalBgUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              } : {}}>
              {!config.globalBgUrl && <p className="settings-bg-empty">Sin imagen de fondo</p>}
            </div>

            <div className="settings-row">
              <button className="btn-outline" onClick={() => bgRef.current?.click()}>
                📁 Subir imagen desde computadora
              </button>
              {config.globalBgUrl && (
                <button className="btn-danger" onClick={() => setConfig('globalBgUrl', '')}>
                  ✕ Quitar fondo
                </button>
              )}
            </div>
            <input ref={bgRef} type="file" accept="image/*" className="sr-only"
              onChange={e => readFile(e.target.files[0], url => setConfig('globalBgUrl', url))} />

            <div className="settings-row">
              <label className="settings-label">O pega una URL de imagen</label>
              <input className="form-input"
                placeholder="https://..."
                onBlur={e => { if (e.target.value.startsWith('http')) setConfig('globalBgUrl', e.target.value) }} />
            </div>

            {config.globalBgUrl && (
              <div className="settings-row">
                <label className="settings-label">Opacidad del overlay oscuro ({Math.round((1 - config.globalBgOpacity) * 100)}%)</label>
                <input type="range" min="0" max="1" step="0.05"
                  value={1 - config.globalBgOpacity}
                  onChange={e => setConfig('globalBgOpacity', 1 - parseFloat(e.target.value))}
                  className="settings-range" />
              </div>
            )}
          </div>
        )}

        {/* TYPOGRAPHY TAB */}
        {tab === 'typography' && (
          <div className="settings-section">
            <h2 className="settings-h2">Tipografía</h2>

            <div className="settings-row">
              <label className="settings-label">Fuente</label>
              <div className="font-options">
                {FONTS.map(f => (
                  <button
                    key={f.value}
                    className={`font-option ${config.fontFamily === f.value ? 'font-option--active' : ''}`}
                    style={{ fontFamily: f.value }}
                    onClick={() => setConfig('fontFamily', f.value)}
                  >
                    {f.label}
                    <span className="font-sample">Aa Bb 123</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-row">
              <label className="settings-label">Tamaño base ({config.fontSize}px)</label>
              <div className="font-size-options">
                {FONT_SIZES.map(sz => (
                  <button key={sz}
                    className={`font-size-btn ${config.fontSize === sz ? 'font-size-btn--active' : ''}`}
                    onClick={() => setConfig('fontSize', sz)}
                  >{sz}px</button>
                ))}
              </div>
            </div>

            <div className="settings-preview-text" style={{ fontFamily: config.fontFamily, fontSize: config.fontSize }}>
              <p style={{ fontSize: '1.5em', fontWeight: 800 }}>Estudio de Comisiones</p>
              <p>Retrato de mascota — Sofía | 2026-08-07</p>
              <p style={{ color: 'var(--text-muted)' }}>Serie personal: Guardianes del metro</p>
            </div>
          </div>
        )}

        {/* PAGE BACKGROUNDS TAB */}
        {tab === 'pageBgs' && (
          <div className="settings-section">
            <h2 className="settings-h2">Fondos de página</h2>
            <p className="settings-desc">Cada sección puede tener su propia imagen de fondo.</p>
            <div className="page-bg-list">
              {PAGE_BG_ENTRIES.map(entry => {
                const bg = config.sectionBgs?.[entry.id]
                return (
                  <div key={entry.id} className="page-bg-item">
                    <div className="page-bg-thumb"
                      style={bg?.url ? {
                        backgroundImage: `url(${bg.url})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      } : {}}>
                      {!bg?.url && <span className="page-bg-empty-icon">{entry.icon}</span>}
                    </div>
                    <div className="page-bg-info">
                      <span className="page-bg-label">{entry.icon} {entry.label}</span>
                      <div className="page-bg-actions">
                        <button className="btn-outline"
                          onClick={() => setBgEditorPage(entry.id)}>
                          {bg?.url ? '✎ Cambiar fondo' : '+ Agregar fondo'}
                        </button>
                        {bg?.url && (
                          <button className="btn-danger"
                            onClick={() => {
                              const updated = { ...config.sectionBgs }
                              delete updated[entry.id]
                              setConfig('sectionBgs', updated)
                            }}>
                            ✕ Quitar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {bgEditorPage && (
          <PageBackgroundEditor
            pageId={bgEditorPage}
            initialBackground={config.sectionBgs?.[bgEditorPage] || null}
            onSave={(bg) => {
              setConfig('sectionBgs', { ...config.sectionBgs, [bgEditorPage]: bg })
            }}
            onClose={() => setBgEditorPage(null)}
          />
        )}

        {/* CONNECTIONS TAB — API keys y tokens */}
        {tab === 'connections' && (
          <div className="settings-section">
            <h2 className="settings-h2">🔌 Conexiones API</h2>
            <p className="settings-desc">Configura las conexiones para servicios externos.</p>

            {/* Info box redirigiendo a companion app */}
            <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-md)', padding: '1.5rem', marginBottom: '1.5rem', borderLeft: '3px solid var(--green)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>🤖</span>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Configuración de IAs (HuggingFace, Mistral)</h3>
              </div>
              <p style={{ fontSize: '0.85rem', margin: 0, color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Los tokens de HuggingFace y Mistral AI ahora se configuran en la <strong>Companion App</strong> para evitar problemas de CORS y rate limiting.
              </p>
              <p style={{ fontSize: '0.85rem', margin: 0, color: 'var(--text-muted)' }}>
                <strong style="color:var(--green)">💡 Para configurar:</strong>
                <br />
                1. Abre la <strong>Commission Manager Companion App</strong>
                <br />
                2. Ve a <strong>Configuración → IAs & Taggers</strong>
                <br />
                3. Ingresa tus tokens de HuggingFace (gratis) y/o Mistral AI (pago)
                <br />
                4. Haz clic en <strong>Guardar</strong>
              </p>
            </div>

            {/* Gmail section - placeholder for Task 6 */}
            <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>📧</span>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Gmail</h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Conecta tu cuenta de Gmail para recibir notificaciones de nuevas comisiones.
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                (Próximamente en esta sección)
              </p>
            </div>

            {/* Telegram section - placeholder for Task 6 */}
            <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>✈️</span>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Telegram</h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Configura un bot de Telegram para publicar automáticamente tus comisiones.
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                (Próximamente en esta sección)
              </p>
            </div>
          </div>
        )}

        {/* STORAGE TAB — monitor de Supabase, R2, localStorage */}
        {tab === 'storage' && (
          <div className="settings-section">
            <h2 className="settings-h2">🗄 Storage Monitor</h2>
            <p className="settings-desc">
              Visualiza en tiempo real qué datos hay en cada servicio de almacenamiento.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: '0.875rem', borderLeft: '3px solid var(--green)' }}>
                <p style={{ fontWeight: 700, marginBottom: '0.25rem' }}>🗄 Supabase</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Config, tareas, solicitudes, portafolio (metadatos), archivados, guía, kanban</p>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: '0.875rem', borderLeft: '3px solid #38bdf8' }}>
                <p style={{ fontWeight: 700, marginBottom: '0.25rem' }}>☁ Cloudflare R2</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Imágenes de portafolio, adjuntos de comisiones, fondos de página</p>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: '0.875rem', borderLeft: '3px solid var(--orange)' }}>
                <p style={{ fontWeight: 700, marginBottom: '0.25rem' }}>💾 localStorage</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Solo caché temporal. Debería estar vacío cuando hay sesión activa.</p>
              </div>
            </div>

            <button
              className="btn-primary"
              onClick={() => setShowStorageMonitor(true)}
              style={{ fontSize: '0.9rem', padding: '0.6rem 1.25rem' }}
            >
              🔍 Abrir Storage Monitor
            </button>

            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
              También puedes acceder desde el botón <strong>🗄 Storage</strong> abajo a la derecha de cualquier página.
            </p>
          </div>
        )}

        {showStorageMonitor && <StorageMonitor onClose={() => setShowStorageMonitor(false)} />}
      </div>
    </div>
  )
}
