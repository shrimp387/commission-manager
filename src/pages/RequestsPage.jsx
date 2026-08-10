import React, { useState } from 'react'
import CommissionForm from '../components/requests/CommissionForm.jsx'
import RequestsList from '../components/requests/RequestsList.jsx'
import TelegramConfig from '../components/requests/TelegramConfig.jsx'

export default function RequestsPage() {
  const [tab, setTab] = useState('list') // 'list' | 'new' | 'telegram'

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-bg page-header-bg--orange" aria-hidden="true" />
        <div className="page-header-content">
          <div className="page-header-brand">
            <div className="page-header-icon" aria-hidden="true">📋</div>
            <div>
              <p className="page-header-eyebrow">GESTIÓN DE CLIENTES</p>
              <h1 className="page-header-title">Solicitudes de Comisión</h1>
              <p className="page-header-sub">Recibe y gestiona solicitudes de tus clientes.</p>
            </div>
          </div>
          <div className="page-header-actions">
            <button
              className={`btn-tab ${tab === 'telegram' ? 'btn-tab--active' : ''}`}
              onClick={() => setTab('telegram')}
            >
              ✈ Telegram
            </button>
            <button
              className="btn-primary"
              onClick={() => setTab('new')}
            >
              + Nueva solicitud
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Tabs */}
        <div className="tab-bar" role="tablist">
          <button
            className={`tab-btn ${tab === 'list' ? 'tab-btn--active' : ''}`}
            onClick={() => setTab('list')}
            role="tab"
            aria-selected={tab === 'list'}
          >
            📥 Solicitudes recibidas
          </button>
          <button
            className={`tab-btn ${tab === 'new' ? 'tab-btn--active' : ''}`}
            onClick={() => setTab('new')}
            role="tab"
            aria-selected={tab === 'new'}
          >
            ✏ Formulario público
          </button>
          <button
            className={`tab-btn ${tab === 'telegram' ? 'tab-btn--active' : ''}`}
            onClick={() => setTab('telegram')}
            role="tab"
            aria-selected={tab === 'telegram'}
          >
            ✈ Config Telegram
          </button>
        </div>

        {tab === 'list' && <RequestsList />}
        {tab === 'new' && <CommissionForm onSubmit={() => setTab('list')} />}
        {tab === 'telegram' && <TelegramConfig />}
      </div>
    </div>
  )
}
