/**
 * EmailTemplateEditor — Editor de plantillas de email para aceptación/rechazo.
 * El artista redacta su mensaje personalizado con:
 *   - Texto libre con variables como {nombre}, {tipo}, {precio}
 *   - Stickers de Telegram embebidos como imágenes en el email
 *   - Preview del email final
 *   - Se guarda en appConfig
 */
import React, { useState, useEffect, useRef } from 'react'
import { getConfig, setConfig } from '../../store/appConfig.js'
import StickerPanel from '../StickerPanel.jsx'
import { getTelegramConfig, getTelegramFileUrl } from '../../utils/telegram.js'

const DEFAULT_ACCEPT = `¡Hola {nombre}!

Estoy encantada de aceptar tu solicitud de comisión. Me emociona mucho trabajar en este proyecto.

Tipo de obra: {tipo}
Precio acordado: {precio}

Para continuar, por favor realiza el pago usando los métodos indicados abajo. Una vez confirmado, comenzaré a trabajar.

¡Gracias por confiar en mi estudio!
Con cariño,
{artista}`

const DEFAULT_REJECT = `Hola {nombre},

Gracias por tomarte el tiempo de enviar tu solicitud. Lamentablemente, en este momento no puedo aceptar tu comisión.

{motivo}

Espero que en una próxima ocasión podamos trabajar juntos. ¡Muchas gracias por tu interés!

{artista}`

const VARIABLES = [
  { key: '{nombre}', desc: 'Nombre del cliente' },
  { key: '{tipo}', desc: 'Tipo de obra' },
  { key: '{precio}', desc: 'Precio acordado' },
  { key: '{artista}', desc: 'Tu nombre/estudio' },
  { key: '{motivo}', desc: 'Motivo de rechazo (solo en plantilla de rechazo)' },
  { key: '{redes}', desc: 'Tus redes sociales' },
]

function StickerPicker({ onInsert, onClose }) {
  const anchorRef = useRef(null)
  return (
    <div className="email-sticker-picker" onClick={e => e.stopPropagation()}>
      <div className="email-sticker-picker-header">
        <span>Selecciona un sticker para insertar en el email</span>
        <button className="modal-close" onClick={onClose}>×</button>
      </div>
      <div ref={anchorRef} style={{ height: 0 }} />
      <StickerPanel
        anchorRef={anchorRef}
        onSelect={async (sticker) => {
          const cfg = getTelegramConfig()
          const token = cfg?.token || ''
          const thumbFileId = sticker.thumbnail?.file_id ?? sticker.thumb?.file_id
          let thumbUrl = null
          if (token && thumbFileId) {
            thumbUrl = await getTelegramFileUrl(token, thumbFileId)
          }
          if (thumbUrl) {
            onInsert(thumbUrl, sticker.emoji)
          }
          onClose()
        }}
        onClose={onClose}
      />
    </div>
  )
}

function TemplateTab({ type, label, icon }) {
  const configKey = type === 'accept' ? 'emailTemplateAccept' : 'emailTemplateReject'
  const defaultText = type === 'accept' ? DEFAULT_ACCEPT : DEFAULT_REJECT

  const [text, setText] = useState(() => getConfig()[configKey] || defaultText)
  const [stickers, setStickers] = useState(() => getConfig()[`${configKey}Stickers`] || [])
  const [showStickers, setShowStickers] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [saved, setSaved] = useState(false)
  const textareaRef = useRef(null)

  function handleSave() {
    setConfig(configKey, text)
    setConfig(`${configKey}Stickers`, stickers)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function handleReset() {
    if (!confirm('¿Restaurar el mensaje por defecto?')) return
    setText(defaultText)
    setStickers([])
  }

  function insertVariable(variable) {
    const ta = textareaRef.current
    if (!ta) { setText(t => t + variable); return }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const newText = text.slice(0, start) + variable + text.slice(end)
    setText(newText)
    setTimeout(() => {
      ta.selectionStart = ta.selectionEnd = start + variable.length
      ta.focus()
    }, 0)
  }

  function insertSticker(thumbUrl, emoji) {
    setStickers(s => [...s, { thumbUrl, emoji, id: Date.now() }])
  }

  function removeSticker(id) {
    setStickers(s => s.filter(x => x.id !== id))
  }

  // Build preview HTML
  function buildPreviewHtml() {
    const stickerHtml = stickers.map(s =>
      `<img src="${s.thumbUrl}" alt="${s.emoji || 'sticker'}" style="width:80px;height:80px;object-fit:contain;margin:4px;" />`
    ).join('')

    return `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background:#1a1a1e;color:#e8e8ec;border-radius:14px;border:1px solid #2e2e36;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#1a1a1e,#222227);padding:24px 32px;border-bottom:1px solid #2e2e36;">
          <span style="background:${type === 'accept' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'};color:${type === 'accept' ? '#22C55E' : '#EF4444'};border:1px solid ${type === 'accept' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'};border-radius:99px;font-size:12px;font-weight:700;padding:4px 14px;letter-spacing:0.06em;text-transform:uppercase;">
            ${type === 'accept' ? '✅ Comisión Aceptada' : 'Solicitud no aceptada'}
          </span>
          <h2 style="font-size:20px;font-weight:800;color:#e8e8ec;margin:12px 0 4px;">${type === 'accept' ? '¡Tu comisión fue aceptada!' : 'Sobre tu solicitud'}</h2>
        </div>
        <div style="padding:24px 32px;">
          <p style="font-size:14px;line-height:1.7;white-space:pre-wrap;color:#e8e8ec;">${text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>
          ${stickers.length > 0 ? `<div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:8px;">${stickerHtml}</div>` : ''}
        </div>
        <div style="background:#111113;padding:12px 32px;font-size:11px;color:#555560;text-align:center;">
          Enviado automáticamente desde tu Estudio de Comisiones
        </div>
      </div>
    `
  }

  return (
    <div className="email-template-tab">
      {/* Variable chips */}
      <div className="email-template-vars">
        <span className="email-template-vars-label">Variables disponibles:</span>
        {VARIABLES.map(v => (
          <button
            key={v.key}
            className="email-var-chip"
            onClick={() => insertVariable(v.key)}
            title={v.desc}
          >
            {v.key}
          </button>
        ))}
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        className="email-template-textarea"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={`Escribe tu mensaje de ${label.toLowerCase()}...`}
        rows={12}
      />

      {/* Sticker strip */}
      {stickers.length > 0 && (
        <div className="email-sticker-strip">
          <span className="email-sticker-strip-label">Stickers en el email:</span>
          <div className="email-sticker-strip-items">
            {stickers.map(s => (
              <div key={s.id} className="email-sticker-strip-chip">
                <img src={s.thumbUrl} alt={s.emoji || 'sticker'} />
                <button
                  className="email-sticker-strip-remove"
                  onClick={() => removeSticker(s.id)}
                  aria-label="Quitar sticker"
                >×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sticker picker */}
      {showStickers && (
        <div className="email-sticker-picker-wrap">
          <StickerPicker onInsert={insertSticker} onClose={() => setShowStickers(false)} />
        </div>
      )}

      {/* Actions */}
      <div className="email-template-actions">
        <button className="btn-sm-primary" onClick={handleSave}>
          {saved ? '✓ Guardado' : '💾 Guardar plantilla'}
        </button>
        <button
          className="btn-sm-ghost"
          onClick={() => setShowStickers(s => !s)}
          title="Agregar sticker de Telegram al email"
        >
          🎭 Sticker
        </button>
        <button
          className="btn-sm-ghost"
          onClick={() => setShowPreview(s => !s)}
        >
          {showPreview ? 'Ocultar preview' : '👁 Ver preview'}
        </button>
        <button className="btn-sm-ghost" onClick={handleReset} style={{ marginLeft: 'auto' }}>
          Restaurar default
        </button>
      </div>

      {/* Preview */}
      {showPreview && (
        <div className="email-preview-wrap">
          <p className="email-preview-label">Preview del email que recibirá el cliente:</p>
          <div
            className="email-preview-frame"
            dangerouslySetInnerHTML={{ __html: buildPreviewHtml() }}
          />
        </div>
      )}
    </div>
  )
}

export default function EmailTemplateEditor() {
  const [activeTab, setActiveTab] = useState('accept')

  return (
    <div className="email-template-editor">
      <div className="email-template-header">
        <h3 className="email-template-title">✉️ Plantillas de email automático</h3>
        <p className="email-template-desc">
          Personaliza los mensajes que se enviarán automáticamente al aceptar o rechazar una comisión.
          Usa las variables para insertar datos del cliente dinámicamente.
        </p>
      </div>

      <div className="email-template-tabs">
        <button
          className={`email-template-tab-btn${activeTab === 'accept' ? ' active' : ''}`}
          onClick={() => setActiveTab('accept')}
        >
          ✅ Aceptación
        </button>
        <button
          className={`email-template-tab-btn${activeTab === 'reject' ? ' active' : ''}`}
          onClick={() => setActiveTab('reject')}
        >
          ❌ Rechazo
        </button>
      </div>

      {activeTab === 'accept' && <TemplateTab type="accept" label="Aceptación" />}
      {activeTab === 'reject' && <TemplateTab type="reject" label="Rechazo" />}
    </div>
  )
}
