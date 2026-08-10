import React, { useState, useEffect } from 'react'
import { getTelegramConfig, saveTelegramConfig, testTelegramConnection } from '../../utils/telegram.js'

export default function TelegramConfig() {
  const [token, setToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    const config = getTelegramConfig()
    if (config) {
      setToken(config.token || '')
      setChatId(config.chatId || '')
    }
  }, [])

  function handleSave() {
    saveTelegramConfig(token.trim(), chatId.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function handleTest() {
    if (!token.trim() || !chatId.trim()) {
      setTestResult({ ok: false, reason: 'Completa el Bot Token y el Chat ID primero' })
      return
    }
    setTesting(true)
    setTestResult(null)
    const result = await testTelegramConnection(token.trim(), chatId.trim())
    setTestResult(result)
    setTesting(false)
  }

  return (
    <div className="telegram-config">
      <div className="config-card">
        <div className="config-header">
          <span className="config-icon" aria-hidden="true">✈</span>
          <div>
            <h2 className="config-title">Configuración de Telegram</h2>
            <p className="config-sub">
              Recibe notificaciones instantáneas cuando llegan nuevas solicitudes.
            </p>
          </div>
        </div>

        {/* How to get a bot */}
        <div className="config-guide">
          <p className="guide-title">📋 Cómo crear tu bot:</p>
          <ol className="guide-steps">
            <li>Abre Telegram y busca <strong>@BotFather</strong></li>
            <li>Envía el comando <code>/newbot</code></li>
            <li>Sigue las instrucciones y copia el <strong>Bot Token</strong></li>
            <li>Para el Chat ID: busca <strong>@userinfobot</strong> y envía un mensaje</li>
            <li>Pega los datos aquí y haz clic en "Guardar"</li>
          </ol>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="tg-token">Bot Token</label>
          <input
            id="tg-token"
            className="form-input"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
            type="password"
            autoComplete="off"
          />
          <p className="form-hint">Lo obtienes de @BotFather en Telegram</p>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="tg-chat">Chat ID</label>
          <input
            id="tg-chat"
            className="form-input"
            value={chatId}
            onChange={e => setChatId(e.target.value)}
            placeholder="-100123456789"
          />
          <p className="form-hint">
            Tu ID personal o el ID del grupo/canal donde recibirás los mensajes
          </p>
        </div>

        <div className="config-actions">
          <button
            className="btn-outline"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? '⏳ Probando...' : '🔌 Probar conexión'}
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={!token.trim() || !chatId.trim()}
          >
            {saved ? '✓ Guardado' : '💾 Guardar configuración'}
          </button>
        </div>

        {testResult && (
          <div className={`test-result ${testResult.ok ? 'test-result--ok' : 'test-result--err'}`}
            role="status"
          >
            {testResult.ok
              ? '✅ ¡Conexión exitosa! Revisa tu Telegram.'
              : `❌ Error: ${testResult.reason}`}
          </div>
        )}

        {/* Status indicator */}
        <div className="config-status">
          <span className={`status-dot ${token && chatId ? 'status-dot--ok' : 'status-dot--off'}`} aria-hidden="true" />
          <span className="status-text">
            {token && chatId ? 'Telegram configurado' : 'Telegram no configurado'}
          </span>
        </div>
      </div>
    </div>
  )
}
