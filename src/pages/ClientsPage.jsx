/**
 * ClientsPage — Base de datos de clientes del estudio.
 *
 * Muestra historial de clientes, comisiones realizadas,
 * gasto total y notas personales de cada cliente.
 * Los clientes se crean automáticamente al aceptar solicitudes.
 */
import React, { useState, useEffect } from 'react'
import { getClients, upsertClient, deleteClient } from '../lib/clientsDb.js'
import { useAuth } from '../lib/AuthContext.jsx'

function ClientCard({ client, isSelected, onClick }) {
  const initials = client.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <button
      className={`arch-item ${isSelected ? 'arch-item--active' : ''}`}
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'var(--green)', color: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
      }}>
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {client.name}
        </p>
        <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {client.totalCommissions} comisión{client.totalCommissions !== 1 ? 'es' : ''}
          {client.totalSpent > 0 ? ` · $${client.totalSpent.toFixed(2)}` : ''}
        </p>
      </div>
      {client.lastCommissionAt && (
        <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', flexShrink: 0 }}>
          {new Date(client.lastCommissionAt).toLocaleDateString('es', { month: 'short', day: 'numeric' })}
        </span>
      )}
    </button>
  )
}

function ClientDetail({ client, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ notes: client.notes, tags: client.tags?.join(', ') ?? '' })

  useEffect(() => {
    setForm({ notes: client.notes, tags: client.tags?.join(', ') ?? '' })
    setEditing(false)
  }, [client.id])

  async function handleSave() {
    await onSave({
      ...client,
      notes: form.notes,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
    })
    setEditing(false)
  }

  return (
    <div className="arch-detail">
      <div className="arch-detail-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--green)', color: '#000',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem', fontWeight: 700, flexShrink: 0,
          }}>
            {client.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h2 className="arch-detail-title" style={{ marginBottom: 0 }}>{client.name}</h2>
            {client.email && <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{client.email}</p>}
          </div>
        </div>
        <button className="btn-danger" onClick={() => onDelete(client.id)} title="Eliminar cliente">🗑</button>
      </div>

      {/* Stats */}
      <div className="arch-detail-grid" style={{ marginTop: '1rem' }}>
        <div className="arch-detail-field">
          <label>Comisiones</label>
          <span style={{ color: 'var(--green)', fontWeight: 700 }}>{client.totalCommissions}</span>
        </div>
        {client.totalSpent > 0 && (
          <div className="arch-detail-field">
            <label>Gasto total</label>
            <span style={{ color: 'var(--green)', fontWeight: 700 }}>${client.totalSpent.toFixed(2)} USD</span>
          </div>
        )}
        {client.social && (
          <div className="arch-detail-field">
            <label>Redes</label>
            <span>{client.social}</span>
          </div>
        )}
        {client.lastCommissionAt && (
          <div className="arch-detail-field">
            <label>Última comisión</label>
            <span>{new Date(client.lastCommissionAt).toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        )}
        {client.createdAt && (
          <div className="arch-detail-field">
            <label>Cliente desde</label>
            <span>{new Date(client.createdAt).toLocaleDateString('es', { year: 'numeric', month: 'long' })}</span>
          </div>
        )}
      </div>

      {/* Notes */}
      <div style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
          <label className="form-label" style={{ margin: 0 }}>Notas personales</label>
          {!editing && (
            <button className="btn-ghost" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }} onClick={() => setEditing(true)}>✎ Editar</button>
          )}
        </div>
        {editing ? (
          <>
            <textarea
              className="form-textarea"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Preferencias, estilo favorito, historial de contacto..."
              rows={4}
            />
            <div className="form-group" style={{ marginTop: '0.5rem' }}>
              <label className="form-label">Tags (separados por coma)</label>
              <input
                className="form-input"
                value={form.tags}
                onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="vip, recurrente, furry, etc."
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button className="btn-primary" onClick={handleSave}>Guardar</button>
              <button className="btn-outline" onClick={() => setEditing(false)}>Cancelar</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: '0.82rem', color: client.notes ? 'var(--text)' : 'var(--text-dim)', lineHeight: 1.6 }}>
              {client.notes || 'Sin notas aún. Haz clic en Editar para agregar.'}
            </p>
            {client.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.5rem' }}>
                {client.tags.map(t => (
                  <span key={t} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 99, padding: '0.1rem 0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function ClientsPage() {
  const { user } = useAuth()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    getClients().then(data => {
      setClients(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [user?.id])

  async function handleSave(updated) {
    const saved = await upsertClient(updated)
    if (saved) {
      setClients(prev => prev.map(c => c.id === saved.id ? saved : c))
      setSelected(saved)
    }
  }

  async function handleDelete(clientId) {
    if (!confirm('¿Eliminar este cliente permanentemente?')) return
    await deleteClient(clientId)
    setClients(prev => prev.filter(c => c.id !== clientId))
    setSelected(null)
  }

  const filtered = clients.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.social?.toLowerCase().includes(search.toLowerCase())
  )

  const totalSpent = clients.reduce((s, c) => s + (c.totalSpent ?? 0), 0)
  const totalCommissions = clients.reduce((s, c) => s + (c.totalCommissions ?? 0), 0)

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-bg" aria-hidden="true" style={{ background: 'linear-gradient(135deg, rgba(96,165,250,0.15) 0%, transparent 60%)' }} />
        <div className="page-header-content">
          <div className="page-header-brand">
            <div className="page-header-icon">👥</div>
            <div>
              <p className="page-header-eyebrow">GESTIÓN</p>
              <h1 className="page-header-title">Clientes</h1>
              <p className="page-header-sub">
                {clients.length} cliente{clients.length !== 1 ? 's' : ''} · {totalCommissions} comisiones · ${totalSpent.toFixed(0)} total
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body">
        {clients.length === 0 && !loading ? (
          <div className="arch-empty">
            <p style={{ fontSize: '2rem' }}>👥</p>
            <p>No hay clientes aún.</p>
            <p className="arch-empty-hint">Los clientes se agregan automáticamente cuando aceptas una solicitud de comisión.</p>
          </div>
        ) : (
          <div className="arch-layout">
            {/* List */}
            <div className="arch-list">
              <div className="arch-search-wrap" style={{ marginBottom: '0.75rem' }}>
                <span className="arch-search-icon">🔍</span>
                <input
                  className="arch-search"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, email o redes..."
                />
                {search && <button className="arch-search-clear" onClick={() => setSearch('')}>×</button>}
              </div>

              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                  <div className="mini-spinner" />
                </div>
              ) : filtered.length === 0 ? (
                <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem', padding: '1rem' }}>Sin resultados para "{search}"</p>
              ) : (
                filtered.map(client => (
                  <ClientCard
                    key={client.id}
                    client={client}
                    isSelected={selected?.id === client.id}
                    onClick={() => setSelected(client)}
                  />
                ))
              )}
            </div>

            {/* Detail */}
            {selected && (
              <ClientDetail
                client={selected}
                onSave={handleSave}
                onDelete={handleDelete}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
