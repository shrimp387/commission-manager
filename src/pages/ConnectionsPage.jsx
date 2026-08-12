import React, { useState, useEffect, useCallback } from 'react'
import {
  isGmailConnected,
  getGmailTokens,
  openGoogleOAuth,
  clearGmailTokens,
  sendGmail,
} from '../utils/gmail.js'
import {
  getTelegramConfig,
  saveTelegramConfig,
  testTelegramConnection,
  getTelegramFileUrl,
} from '../utils/telegram.js'
import { getTelegramConfig as getTelegramConfigDb } from '../lib/db.js'
import { getConfig, setConfig } from '../store/appConfig.js'
import { getPostyBirbAccounts } from '../lib/postybirb.js'
import { testE621Credentials } from '../lib/platforms/e621.js'

// ─── Telegram Sticker Manager (embedded) ──────────────────────────────────────

function TelegramStickerManager({ token }) {
  const [sets, setSets] = useState(() => getConfig().telegramStickerSets ?? [])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [loadedData, setLoadedData] = useState({})

  // Load already-saved sets on mount
  useEffect(() => {
    sets.forEach(name => {
      if (!loadedData[name]) fetchSet(name, false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchSet(name, addIfNew = true) {
    if (!token) { setError('Configura primero el Bot Token de Telegram arriba.'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getStickerSet?name=${encodeURIComponent(name)}`
      )
      const data = await res.json()
      if (!data.ok) {
        setError(data.description || `Set "${name}" no encontrado.`)
        setLoading(false)
        return
      }

      const result = data.result

      // Resolve thumbnail URLs via getFile for the first 8 stickers
      const stickersWithUrls = await Promise.all(
        result.stickers.map(async (s, idx) => {
          // Only resolve first 8 thumbs for preview (avoid too many requests)
          if (idx >= 8) return s
          const thumbFileId = s.thumbnail?.file_id ?? s.thumb?.file_id
          const url = await getTelegramFileUrl(token, thumbFileId)
          return url ? { ...s, _thumbUrl: url } : s
        })
      )

      setLoadedData(prev => ({
        ...prev,
        [result.name]: { ...result, stickers: stickersWithUrls }
      }))

      if (addIfNew) {
        const current = getConfig().telegramStickerSets ?? []
        if (!current.includes(result.name)) {
          const updated = [...current, result.name]
          setConfig('telegramStickerSets', updated)
          setSets(updated)
        }
      }
      setInput('')
    } catch (err) {
      setError('Error de red al contactar Telegram.')
    }
    setLoading(false)
  }

  // Parse set name from t.me/addstickers/... link or plain name
  function parseStickerInput(raw) {
    const trimmed = raw.trim()
    const match = trimmed.match(/t\.me\/addstickers\/([A-Za-z0-9_]+)/i)
    return match ? match[1] : trimmed
  }

  function handleAdd() {
    const name = parseStickerInput(input)
    if (!name) return
    fetchSet(name, true)
  }

  function removeSet(name) {
    const displayName = loadedData[name]?.title ?? name
    if (!window.confirm(`¿Eliminar el set «${displayName}»?`)) return
    const updated = sets.filter(n => n !== name)
    setConfig('telegramStickerSets', updated)
    setSets(updated)
    setLoadedData(prev => { const c = { ...prev }; delete c[name]; return c })
  }

  return (
    <div className="conn-section">
      <h3 className="conn-section-title">🎭 Mis Sticker Sets</h3>
      <p className="conn-section-desc">
        Agrega sets de stickers de Telegram por nombre o pegando el enlace <code>t.me/addstickers/...</code>.
        Los sets guardados aparecen en el panel de reacciones de cada comisión.
      </p>

      <div className="conn-sticker-add">
        <input
          className="form-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Nombre del set o https://t.me/addstickers/Animals"
          disabled={loading}
        />
        <button
          className="btn-primary"
          onClick={handleAdd}
          disabled={loading || !input.trim()}
        >
          {loading ? '...' : '+ Agregar'}
        </button>
      </div>

      {error && <p className="conn-error">{error}</p>}

      {sets.length === 0 ? (
        <p className="conn-empty">No tienes ningún sticker set guardado todavía.</p>
      ) : (
        <div className="conn-sticker-sets">
          {sets.map(name => {
            const data = loadedData[name]
            return (
              <div key={name} className="conn-sticker-set-card">
                <div className="conn-sticker-set-header">
                  <span className="conn-sticker-set-name">{data?.title ?? name}</span>
                  <span className="conn-sticker-set-count">
                    {data ? `${data.stickers.length} stickers` : 'Cargando...'}
                  </span>
                </div>
                {data && (
                  <div className="conn-sticker-preview">
                    {data.stickers.slice(0, 8).map(s => (
                      <div key={s.file_unique_id} className="conn-sticker-thumb">
                        {s._thumbUrl ? (
                          <img
                            src={s._thumbUrl}
                            alt={s.emoji ?? 'sticker'}
                            loading="lazy"
                            onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                          />
                        ) : null}
                        <span
                          style={{
                            fontSize: '1.5rem',
                            display: s._thumbUrl ? 'none' : 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '100%',
                            height: '100%',
                          }}
                        >
                          {s.emoji ?? '🖼'}
                        </span>
                      </div>
                    ))}
                    {data.stickers.length > 8 && (
                      <div className="conn-sticker-thumb conn-sticker-more">
                        +{data.stickers.length - 8}
                      </div>
                    )}
                  </div>
                )}
                {/* Delete button always visible at the bottom of the card (req 4.1, 4.5) */}
                <div className="conn-sticker-card-footer">
                  <button
                    className="btn-danger conn-sticker-delete-btn"
                    onClick={() => removeSet(name)}
                    aria-label={`Eliminar set ${data?.title ?? name}`}
                  >
                    🗑 Eliminar set
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Gmail test modal ──────────────────────────────────────────────────────────

function GmailTestModal({ onClose }) {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('¡Prueba de conexión!')
  const [body, setBody] = useState('<p>Este es un correo de prueba enviado desde <strong>Estudio de Comisiones</strong>.</p>')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  async function handleSend() {
    if (!to.trim()) return
    setSending(true)
    setResult(null)
    try {
      await sendGmail({ to: to.trim(), subject, htmlBody: body })
      setResult({ ok: true })
    } catch (err) {
      setResult({ ok: false, msg: err.message })
    }
    setSending(false)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel">
        <div className="modal-header">
          <h2 className="modal-title">Enviar correo de prueba</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Para</label>
            <input className="form-input" type="email" value={to}
              onChange={e => setTo(e.target.value)} placeholder="destinatario@ejemplo.com" />
          </div>
          <div className="form-group">
            <label className="form-label">Asunto</label>
            <input className="form-input" value={subject}
              onChange={e => setSubject(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Cuerpo (HTML)</label>
            <textarea className="form-textarea" rows={4} value={body}
              onChange={e => setBody(e.target.value)} />
          </div>
          {result && (
            <p className={`test-result ${result.ok ? 'test-result--ok' : 'test-result--err'}`}>
              {result.ok ? '✅ Correo enviado correctamente' : `❌ ${result.msg}`}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>Cerrar</button>
          <button className="btn-primary" onClick={handleSend} disabled={sending || !to.trim()}>
            {sending ? 'Enviando...' : '📧 Enviar prueba'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main ConnectionsPage ─────────────────────────────────────────────────────

export default function ConnectionsPage() {
  // ── Telegram state ──
  const [tgToken, setTgToken] = useState('')
  const [tgChatId, setTgChatId] = useState('')
  const [tgTesting, setTgTesting] = useState(false)
  const [tgResult, setTgResult] = useState(null)
  const [tgSaved, setTgSaved] = useState(false)

  // ── Gmail state ──
  const [gmailConnected, setGmailConnected] = useState(false)
  const [gmailEmail, setGmailEmail] = useState(null)
  const [showGmailTest, setShowGmailTest] = useState(false)

  // ── PostyBirb state ──
  const [pbUrl, setPbUrl]           = useState('')
  const [pbApiKey, setPbApiKey]     = useState('')
  const [pbSaved, setPbSaved]       = useState(false)
  const [pbUrlError, setPbUrlError] = useState(null)
  const [pbTesting, setPbTesting]   = useState(false)
  const [pbTestResult, setPbTestResult] = useState(null)

  // ── OpenAI state ──
  const [oaiKey, setOaiKey]         = useState('')
  const [oaiSaved, setOaiSaved]     = useState(false)

  // ── e621 state ──
  const [e621User, setE621User]         = useState('')
  const [e621Key,  setE621Key]          = useState('')
  const [e621Saved, setE621Saved]       = useState(false)
  const [e621Testing, setE621Testing]   = useState(false)
  const [e621TestResult, setE621TestResult] = useState(null)

  // Load saved Telegram config on mount — try localStorage cache first, then Supabase
  useEffect(() => {
    async function loadTgConfig() {
      // 1. localStorage (fast, set by auth seed on login)
      const cached = getTelegramConfig()
      if (cached?.token) {
        setTgToken(cached.token)
        setTgChatId(cached.chatId || '')
        return
      }
      // 2. Supabase (slower, but authoritative)
      const dbCfg = await getTelegramConfigDb()
      if (dbCfg?.token) {
        setTgToken(dbCfg.token)
        setTgChatId(dbCfg.chatId || '')
      }
    }
    loadTgConfig()
  }, [])

  // Check Gmail connection on mount
  useEffect(() => {
    const connected = isGmailConnected()
    setGmailConnected(connected)
    if (connected) {
      const tokens = getGmailTokens()
      setGmailEmail(tokens?.userEmail ?? null)
    }
  }, [])

  // Load PostyBirb and OpenAI config on mount
  useEffect(() => {
    const cfg = getConfig()
    if (cfg.postybirbUrl)    setPbUrl(cfg.postybirbUrl)
    if (cfg.postybirbApiKey) setPbApiKey(cfg.postybirbApiKey)
    if (cfg.openaiApiKey)    setOaiKey(cfg.openaiApiKey)
    if (cfg.e621Username)    setE621User(cfg.e621Username)
    if (cfg.e621ApiKey)      setE621Key(cfg.e621ApiKey)
  }, [])

  // ── PostyBirb handlers ──────────────────────────────────────────────────
  function handleSavePostyBirb() {
    const trimmed = pbUrl.trim()
    if (trimmed && !trimmed.startsWith('https://')) {
      setPbUrlError('La URL debe usar HTTPS para funcionar correctamente.')
      return
    }
    setPbUrlError(null)
    setConfig('postybirbUrl', trimmed)
    setConfig('postybirbApiKey', pbApiKey.trim())
    setPbSaved(true)
    setPbTestResult(null)
    setTimeout(() => setPbSaved(false), 2500)
  }

  async function handleTestPostyBirb() {
    setPbTesting(true)
    setPbTestResult(null)
    try {
      const accounts = await getPostyBirbAccounts()
      setPbTestResult({ ok: true, count: accounts.length })
    } catch (err) {
      setPbTestResult({ ok: false, msg: err?.message || 'Error desconocido' })
    }
    setPbTesting(false)
  }

  // ── OpenAI handlers ─────────────────────────────────────────────────────
  function handleSaveOpenAI() {
    setConfig('openaiApiKey', oaiKey.trim())
    setOaiSaved(true)
    setTimeout(() => setOaiSaved(false), 2500)
  }

  // ── e621 handlers ────────────────────────────────────────────────────────
  function handleSaveE621() {
    setConfig('e621Username', e621User.trim())
    setConfig('e621ApiKey', e621Key.trim())
    setE621Saved(true)
    setE621TestResult(null)
    setTimeout(() => setE621Saved(false), 2500)
  }

  async function handleTestE621() {
    if (!e621User.trim() || !e621Key.trim()) return
    setE621Testing(true)
    setE621TestResult(null)
    try {
      const result = await testE621Credentials(e621User.trim(), e621Key.trim())
      setE621TestResult(result)
    } catch (err) {
      setE621TestResult({ ok: false, error: err?.message || 'Error de conexión' })
    }
    setE621Testing(false)
  }

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

  function handleDisconnectGmail() {
    if (!confirm('¿Desconectar Google? Se eliminarán los tokens guardados.')) return
    clearGmailTokens()
    setGmailConnected(false)
    setGmailEmail(null)
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-bg" aria-hidden="true" />
        <div className="page-header-content">
          <div className="page-header-brand">
            <div className="page-header-icon">🔌</div>
            <div>
              <p className="page-header-eyebrow">INTEGRACIONES</p>
              <h1 className="page-header-title">Conexiones</h1>
              <p className="page-header-sub">Conecta Telegram y Google para notificaciones y correos automáticos.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="conn-grid">

          {/* ── TELEGRAM CARD ── */}
          <div className="conn-card">
            <div className="conn-card-header">
              <div className="conn-card-icon" style={{ background: 'rgba(96,165,250,0.12)', color: '#60A5FA' }}>
                ✈️
              </div>
              <div>
                <h2 className="conn-card-title">Telegram</h2>
                <p className="conn-card-sub">Notificaciones de solicitudes + stickers</p>
              </div>
              {tgToken && tgChatId && (
                <span className="conn-status conn-status--ok">● Configurado</span>
              )}
            </div>

            <div className="conn-body">
              {/* Setup guide */}
              <div className="conn-guide">
                <p className="conn-guide-title">📋 Cómo configurar</p>
                <ol className="conn-guide-steps">
                  <li>Abre Telegram y busca <code>@BotFather</code></li>
                  <li>Escribe <code>/newbot</code> y sigue las instrucciones para crear tu bot</li>
                  <li>Copia el <strong>Token HTTP API</strong> que te da BotFather</li>
                  <li>Para obtener tu Chat ID: envía un mensaje a tu bot, luego visita<br />
                    <code>https://api.telegram.org/bot&#123;TOKEN&#125;/getUpdates</code>
                  </li>
                  <li>Pega ambos valores abajo y guarda</li>
                </ol>
              </div>

              <div className="form-group">
                <label className="form-label">Bot Token</label>
                <input
                  className="form-input"
                  type="password"
                  value={tgToken}
                  onChange={e => { setTgToken(e.target.value); setTgResult(null) }}
                  placeholder="123456789:ABCdef..."
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Chat ID</label>
                <input
                  className="form-input"
                  value={tgChatId}
                  onChange={e => { setTgChatId(e.target.value); setTgResult(null) }}
                  placeholder="-100123456789 o tu user ID"
                />
              </div>

              <div className="conn-actions">
                <button
                  className="btn-primary"
                  onClick={handleSaveTelegram}
                  disabled={!tgToken.trim() || !tgChatId.trim()}
                >
                  {tgSaved ? '✓ Guardado' : '💾 Guardar'}
                </button>
                <button
                  className="btn-outline"
                  onClick={handleTestTelegram}
                  disabled={tgTesting || !tgToken.trim() || !tgChatId.trim()}
                >
                  {tgTesting ? 'Probando...' : '🧪 Probar conexión'}
                </button>
              </div>

              {tgResult && (
                <p className={`test-result ${tgResult.ok ? 'test-result--ok' : 'test-result--err'}`}>
                  {tgResult.ok
                    ? '✅ ¡Conexión exitosa! Revisa tu chat de Telegram.'
                    : `❌ Error: ${tgResult.reason}`}
                </p>
              )}

              {/* Sticker Manager */}
              <div className="conn-divider" />
              <TelegramStickerManager token={tgToken} />
            </div>
          </div>

          {/* ── GOOGLE / GMAIL CARD ── */}
          <div className="conn-card">
            <div className="conn-card-header">
              <div className="conn-card-icon" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
                📧
              </div>
              <div>
                <h2 className="conn-card-title">Google / Gmail</h2>
                <p className="conn-card-sub">Envía emails de aceptación automáticamente</p>
              </div>
              {gmailConnected && (
                <span className="conn-status conn-status--ok">● Conectado</span>
              )}
            </div>

            <div className="conn-body">
              {!gmailConnected ? (
                <>
                  <div className="conn-guide">
                    <p className="conn-guide-title">📋 Cómo funciona</p>
                    <ol className="conn-guide-steps">
                      <li>Haz clic en <strong>Conectar con Google</strong></li>
                      <li>Inicia sesión con la cuenta de Gmail desde la que quieres enviar correos</li>
                      <li>Acepta el permiso para enviar emails en tu nombre</li>
                      <li>Al aceptar o rechazar una comisión, se enviará un email automático al cliente</li>
                    </ol>
                  </div>

                  <div className="conn-oauth-box">
                    <div className="conn-oauth-logo" aria-hidden="true">G</div>
                    <div>
                      <p className="conn-oauth-title">Continúa con Google</p>
                      <p className="conn-oauth-sub">Solo se solicita permiso para enviar correos</p>
                    </div>
                    <button className="btn-primary conn-google-btn" onClick={openGoogleOAuth}>
                      🔑 Conectar con Google
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="conn-connected-box">
                    <div className="conn-connected-avatar">G</div>
                    <div>
                      <p className="conn-connected-label">Cuenta conectada</p>
                      <p className="conn-connected-email">{gmailEmail ?? 'Google Account'}</p>
                    </div>
                    <span className="conn-status conn-status--ok" style={{ marginLeft: 'auto' }}>Activo</span>
                  </div>

                  <div className="conn-guide" style={{ marginTop: '1rem' }}>
                    <p className="conn-guide-title">✅ ¿Qué emails se envían automáticamente?</p>
                    <ul className="conn-guide-steps">
                      <li><strong>Al aceptar una solicitud</strong> — email de confirmación con detalles al cliente</li>
                      <li><strong>Al rechazar una solicitud</strong> — email cordial con razón opcional</li>
                      <li>Ambos usan templates HTML con el estilo de tu estudio</li>
                    </ul>
                  </div>

                  <div className="conn-actions">
                    <button className="btn-outline" onClick={() => setShowGmailTest(true)}>
                      📧 Enviar correo de prueba
                    </button>
                    <button className="btn-danger" onClick={handleDisconnectGmail}>
                      Desconectar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── POSTYBIRB CARD ── */}
          <div className="conn-card">
            <div className="conn-card-header">
              <div className="conn-card-icon" style={{ background: 'rgba(124,106,247,0.12)', color: '#7c6af7' }}>
                🐦
              </div>
              <div>
                <h2 className="conn-card-title">PostyBirb</h2>
                <p className="conn-card-sub">Publica en múltiples plataformas artísticas</p>
              </div>
              {getConfig().postybirbUrl && (
                <span className="conn-status conn-status--ok">● Configurado</span>
              )}
            </div>

            <div className="conn-body">
              <div className="conn-guide">
                <p className="conn-guide-title">📋 Cómo configurar</p>
                <ol className="conn-guide-steps">
                  <li>Instala PostyBirb v4 en tu PC usando Docker</li>
                  <li>Crea un Cloudflare Tunnel gratuito apuntando a <code>localhost:8080</code></li>
                  <li>Pega la URL HTTPS del tunnel abajo (ej: <code>https://postybirb.tudominio.com</code>)</li>
                  <li>La API Key es opcional — solo si configuraste contraseña en PostyBirb</li>
                </ol>
                <a
                  href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="conn-guide-link"
                >
                  ¿Cómo configurar el Cloudflare Tunnel? →
                </a>
              </div>

              <div className="form-group">
                <label className="form-label">URL del Cloudflare Tunnel</label>
                <input
                  className="form-input"
                  type="text"
                  value={pbUrl}
                  onChange={e => { setPbUrl(e.target.value); setPbUrlError(null); setPbTestResult(null) }}
                  placeholder="https://postybirb.tudominio.com"
                />
                {pbUrlError && <p className="conn-error">{pbUrlError}</p>}
              </div>

              <div className="form-group">
                <label className="form-label">API Key <span className="conn-optional">(opcional)</span></label>
                <input
                  className="form-input"
                  type="password"
                  value={pbApiKey}
                  onChange={e => { setPbApiKey(e.target.value); setPbTestResult(null) }}
                  placeholder="Solo si configuraste contraseña en PostyBirb"
                  autoComplete="off"
                />
              </div>

              <div className="conn-actions">
                <button
                  className="btn-primary"
                  onClick={handleSavePostyBirb}
                  disabled={!pbUrl.trim()}
                >
                  {pbSaved ? '✓ Guardado' : '💾 Guardar'}
                </button>
                <button
                  className="btn-outline"
                  onClick={handleTestPostyBirb}
                  disabled={pbTesting || !pbUrl.trim()}
                >
                  {pbTesting ? 'Probando...' : '🧪 Probar conexión'}
                </button>
              </div>

              {pbTestResult && (
                <p className={`test-result ${pbTestResult.ok ? 'test-result--ok' : 'test-result--err'}`}>
                  {pbTestResult.ok
                    ? `✅ PostyBirb conectado — ${pbTestResult.count} plataformas disponibles`
                    : `❌ No se pudo conectar. Verifica que el Cloudflare Tunnel esté activo y la URL sea correcta.`}
                </p>
              )}
            </div>
          </div>

          {/* ── OPENAI CARD ── */}
          <div className="conn-card">
            <div className="conn-card-header">
              <div className="conn-card-icon" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
                🤖
              </div>
              <div>
                <h2 className="conn-card-title">OpenAI</h2>
                <p className="conn-card-sub">Generación automática de tags e621</p>
              </div>
              {getConfig().openaiApiKey && (
                <span className="conn-status conn-status--ok">● Configurado</span>
              )}
            </div>

            <div className="conn-body">
              <div className="conn-guide">
                <p className="conn-guide-title">📋 Para qué sirve</p>
                <ul className="conn-guide-steps">
                  <li>Analiza la imagen de tu obra con <strong>GPT-4o Vision</strong></li>
                  <li>Genera tags automáticos en formato e621 (species, character, general...)</li>
                  <li>Aparecen en el panel "Preparar publicación" listos para revisar</li>
                  <li>Obtén tu API Key en <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">platform.openai.com</a></li>
                </ul>
              </div>

              <div className="form-group">
                <label className="form-label">API Key de OpenAI</label>
                <input
                  className="form-input"
                  type="password"
                  value={oaiKey}
                  onChange={e => setOaiKey(e.target.value)}
                  placeholder="sk-..."
                  autoComplete="off"
                />
              </div>

              <div className="conn-actions">
                <button
                  className="btn-primary"
                  onClick={handleSaveOpenAI}
                  disabled={!oaiKey.trim()}
                >
                  {oaiSaved ? '✓ Guardado' : '💾 Guardar'}
                </button>
              </div>
            </div>
          </div>

          {/* ── E621 CARD ── */}
          <div className="conn-card">
            <div className="conn-card-header">
              <div className="conn-card-icon" style={{ background: 'rgba(0,153,255,0.12)', color: '#0099ff' }}>
                🐾
              </div>
              <div>
                <h2 className="conn-card-title">e621</h2>
                <p className="conn-card-sub">Publicación directa de arte furry/SFW</p>
              </div>
              {getConfig().e621Username && getConfig().e621ApiKey && (
                <span className="conn-status conn-status--ok">● Configurado</span>
              )}
            </div>

            <div className="conn-body">
              <div className="conn-guide">
                <p className="conn-guide-title">📋 Cómo obtener tu API Key</p>
                <ol className="conn-guide-steps">
                  <li>Inicia sesión en <a href="https://e621.net" target="_blank" rel="noopener noreferrer">e621.net</a></li>
                  <li>Ve a tu perfil → <strong>Manage API Access</strong></li>
                  <li>Genera una nueva API Key</li>
                  <li>Copia el nombre de usuario y la key abajo</li>
                </ol>
              </div>

              <div className="form-group">
                <label className="form-label">Nombre de usuario en e621</label>
                <input
                  className="form-input"
                  type="text"
                  value={e621User}
                  onChange={e => { setE621User(e.target.value); setE621TestResult(null) }}
                  placeholder="tu_usuario"
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label className="form-label">API Key</label>
                <input
                  className="form-input"
                  type="password"
                  value={e621Key}
                  onChange={e => { setE621Key(e.target.value); setE621TestResult(null) }}
                  placeholder="LbvA2vcAuuDGdb1CouGXFcKJ..."
                  autoComplete="off"
                />
              </div>

              <div className="conn-actions">
                <button
                  className="btn-primary"
                  onClick={handleSaveE621}
                  disabled={!e621User.trim() || !e621Key.trim()}
                >
                  {e621Saved ? '✓ Guardado' : '💾 Guardar'}
                </button>
                <button
                  className="btn-outline"
                  onClick={handleTestE621}
                  disabled={e621Testing || !e621User.trim() || !e621Key.trim()}
                >
                  {e621Testing ? 'Probando...' : '🧪 Probar conexión'}
                </button>
              </div>

              {e621TestResult && (
                <p className={`test-result ${e621TestResult.ok ? 'test-result--ok' : 'test-result--err'}`}>
                  {e621TestResult.ok
                    ? `✅ Conectado como ${e621TestResult.username} (${e621TestResult.level})`
                    : `❌ ${e621TestResult.error || 'Credenciales inválidas'}`}
                </p>
              )}
            </div>
          </div>

        </div>
      </div>

      {showGmailTest && <GmailTestModal onClose={() => setShowGmailTest(false)} />}
    </div>
  )
}
