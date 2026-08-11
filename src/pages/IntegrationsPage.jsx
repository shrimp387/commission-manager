/**
 * IntegrationsPage — Integraciones externas.
 * Webhooks, APIs y herramientas conectadas al estudio.
 */
import React, { useState } from 'react'
import { getConfig, setConfig } from '../store/appConfig.js'
import { useConfig } from '../hooks/useConfig.js'

function IntegrationCard({ icon, name, desc, status, children }) {
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', padding: '1.25rem', borderLeft: `3px solid ${status === 'active' ? 'var(--green)' : 'var(--border)'}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>{name}</p>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{desc}</p>
        </div>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: status === 'active' ? 'var(--green)' : 'var(--text-dim)', background: status === 'active' ? 'rgba(34,197,94,0.1)' : 'var(--surface)', padding: '2px 8px', borderRadius: 99, flexShrink: 0 }}>
          {status === 'active' ? '● Activo' : '○ Inactivo'}
        </span>
      </div>
      {children}
    </div>
  )
}

export default function IntegrationsPage() {
  const config = useConfig()
  const [webhook, setWebhook] = useState(config.webhookUrl || '')
  const [saved, setSaved] = useState(false)

  function saveWebhook() {
    setConfig('webhookUrl', webhook.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function testWebhook() {
    if (!webhook.trim()) return
    try {
      await fetch(webhook.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test', studio: config.projectName, timestamp: new Date().toISOString() }),
      })
      alert('✅ Webhook enviado correctamente')
    } catch (e) {
      alert(`❌ Error: ${e.message}`)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-bg" aria-hidden="true" style={{ background: 'linear-gradient(135deg, rgba(20,184,166,0.1) 0%, transparent 60%)' }} />
        <div className="page-header-content">
          <div className="page-header-brand">
            <div className="page-header-icon">🔗</div>
            <div>
              <p className="page-header-eyebrow">INTEGRACIONES</p>
              <h1 className="page-header-title">Integraciones</h1>
              <p className="page-header-sub">Conecta herramientas externas a tu estudio.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        <IntegrationCard icon="🔔" name="Webhook personalizado" desc="Recibe notificaciones en cualquier URL cuando ocurran eventos en tu estudio (nueva solicitud, comisión aceptada, etc.)."
          status={config.webhookUrl ? 'active' : 'inactive'}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input className="form-input" value={webhook} onChange={e => setWebhook(e.target.value)}
              placeholder="https://hooks.zapier.com/... o https://discord.com/api/webhooks/..."
              style={{ flex: 1 }} />
            <button className="btn-outline" style={{ fontSize: '0.75rem' }} onClick={testWebhook} disabled={!webhook.trim()}>🧪 Probar</button>
            <button className="btn-primary" style={{ fontSize: '0.75rem' }} onClick={saveWebhook}>{saved ? '✓' : 'Guardar'}</button>
          </div>
          <p style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>
            Compatible con Zapier, Make, n8n, Discord webhooks y cualquier URL que acepte POST JSON.
          </p>
        </IntegrationCard>

        <IntegrationCard icon="📧" name="Gmail API" desc="Envía emails de aceptación, rechazo y pago directamente desde tu cuenta de Google."
          status={localStorage.getItem('gmail_tokens') ? 'active' : 'inactive'}>
          <a href="/#/connections" style={{ fontSize: '0.78rem', color: 'var(--green)' }}>Gestionar en Conexiones →</a>
        </IntegrationCard>

        <IntegrationCard icon="✈️" name="Telegram Bot" desc="Recibe notificaciones instantáneas de nuevas solicitudes en tu chat de Telegram."
          status={localStorage.getItem(`telegram_config_${localStorage.getItem('_current_user_id')}`) ? 'active' : 'inactive'}>
          <a href="/#/connections" style={{ fontSize: '0.78rem', color: 'var(--green)' }}>Gestionar en Conexiones →</a>
        </IntegrationCard>

        <IntegrationCard icon="☁️" name="Cloudflare R2" desc="Almacenamiento de imágenes de portafolio y adjuntos de comisiones." status="active">
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>Configurado automáticamente. Las imágenes se almacenan en R2 de forma segura.</p>
        </IntegrationCard>

        <IntegrationCard icon="🗄" name="Supabase" desc="Base de datos de tareas, clientes, solicitudes y configuraciones del estudio." status="active">
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>Conectado. Todos los datos se sincronizan automáticamente.</p>
        </IntegrationCard>
      </div>
    </div>
  )
}
