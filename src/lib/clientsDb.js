/**
 * clientsDb.js — Base de datos de clientes.
 * Supabase tabla: clients
 * Se construye automáticamente desde solicitudes aceptadas.
 */
import { supabase } from './supabase.js'
import { getCurrentUserId } from './db.js'

function useSupabase() {
  const uid = getCurrentUserId()
  return !!supabase && !!uid
}

function uid() { return getCurrentUserId() }

// ── CRUD ──────────────────────────────────────────────────────────────────

export async function getClients() {
  if (!useSupabase()) return []
  const { data } = await supabase
    .from('clients')
    .select('*')
    .eq('user_id', uid())
    .order('last_commission_at', { ascending: false, nullsFirst: false })
  return (data ?? []).map(mapClient)
}

export async function getClient(clientId) {
  if (!useSupabase()) return null
  const { data } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('user_id', uid())
    .single()
  return data ? mapClient(data) : null
}

export async function upsertClient(client) {
  if (!useSupabase()) return null
  const row = {
    user_id: uid(),
    name: client.name,
    email: client.email ?? null,
    social: client.social ?? null,
    notes: client.notes ?? '',
    tags: client.tags ?? [],
    total_commissions: client.totalCommissions ?? 0,
    total_spent: client.totalSpent ?? 0,
    last_commission_at: client.lastCommissionAt ?? null,
    updated_at: new Date().toISOString(),
  }
  if (client.id) row.id = client.id

  const { data, error } = await supabase
    .from('clients')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single()
  if (error) { console.error('[clientsDb] upsert error:', error); return null }
  return mapClient(data)
}

export async function deleteClient(clientId) {
  if (!useSupabase()) return
  await supabase.from('clients').delete().eq('id', clientId).eq('user_id', uid())
}

/**
 * Find or create a client by email.
 * Called automatically when a commission request is accepted.
 */
export async function findOrCreateClientFromRequest(request) {
  if (!useSupabase() || !request.name) return null

  // Try to find by email first
  if (request.email) {
    const { data: existing } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', uid())
      .eq('email', request.email)
      .single()

    if (existing) {
      // Update stats
      const updated = {
        ...mapClient(existing),
        totalCommissions: (existing.total_commissions ?? 0) + 1,
        totalSpent: (existing.total_spent ?? 0) + (request.paymentDetails?.price ?? 0),
        lastCommissionAt: new Date().toISOString(),
        social: request.social || existing.social,
        notes: existing.notes,
      }
      return upsertClient(updated)
    }
  }

  // Create new client
  return upsertClient({
    name: request.name,
    email: request.email ?? null,
    social: request.social ?? null,
    notes: '',
    tags: [],
    totalCommissions: 1,
    totalSpent: request.paymentDetails?.price ?? 0,
    lastCommissionAt: new Date().toISOString(),
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mapClient(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    social: row.social,
    notes: row.notes ?? '',
    tags: row.tags ?? [],
    totalCommissions: row.total_commissions ?? 0,
    totalSpent: row.total_spent ?? 0,
    lastCommissionAt: row.last_commission_at,
    createdAt: row.created_at,
  }
}
