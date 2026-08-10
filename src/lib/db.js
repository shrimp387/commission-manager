/**
 * db.js — Unified data layer.
 *
 * When Supabase is available and user is logged in → uses Supabase.
 * Otherwise → falls back to localStorage (offline / local mode).
 *
 * This keeps the rest of the app working without changes during migration.
 */
import { supabase } from './supabase.js'

// ── Current user ID ────────────────────────────────────────────────────────
let _userId = null

export function setCurrentUserId(id) { _userId = id }
export function getCurrentUserId() { return _userId }

function useSupabase() { return !!supabase && !!_userId }

// ── localStorage helpers ───────────────────────────────────────────────────
function lsGet(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback }
  catch { return fallback }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE (app_config)
// ═══════════════════════════════════════════════════════════════════════════

export async function getProfile() {
  if (useSupabase()) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', _userId)
      .single()
    return data
  }
  return lsGet('app_config', {})
}

export async function updateProfile(updates) {
  if (useSupabase()) {
    const { data, error } = await supabase
      .from('profiles')
      .upsert({ id: _userId, ...updates, updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) throw error
    return data
  }
  const current = lsGet('app_config', {})
  lsSet('app_config', { ...current, ...updates })
}

// ═══════════════════════════════════════════════════════════════════════════
// TASKS (task_fields)
// ═══════════════════════════════════════════════════════════════════════════

export async function getAllTasks() {
  if (useSupabase()) {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', _userId)
    // Convert array to { [id]: fields } map (same shape as localStorage)
    if (!data) return {}
    return Object.fromEntries(data.map(t => {
      const { id, user_id, created_at, updated_at, ...fields } = t
      // camelCase conversion for JS
      return [id, {
        priority: fields.priority,
        stage: fields.stage,
        client: fields.client,
        clientEmail: fields.client_email,
        clientName: fields.client_name,
        deadline: fields.deadline,
        assignee: fields.assignee,
        timer: fields.timer,
        timerRunning: fields.timer_running,
        pinned: fields.pinned,
        note: fields.note,
        progress: fields.progress,
        nextStep: fields.next_step,
        comments: fields.comments,
        attachments: fields.attachments,
        reactions: fields.reactions,
        checklist: fields.checklist,
        activeWidgets: fields.active_widgets,
        commissionRequestId: fields.commission_request_id,
        paymentDetails: fields.payment_details,
        completedState: fields.completed_state,
        completedAt: fields.completed_at,
        awaitingArchive: fields.awaiting_archive,
        archived: fields.archived,
        sectionId: fields.section_id,
      }]
    }))
  }
  return lsGet('task_fields', {})
}

export async function setTaskFieldDb(taskId, field, value) {
  if (useSupabase()) {
    // Map camelCase field names to snake_case DB columns
    const colMap = {
      clientEmail: 'client_email',
      clientName: 'client_name',
      timerRunning: 'timer_running',
      nextStep: 'next_step',
      activeWidgets: 'active_widgets',
      commissionRequestId: 'commission_request_id',
      paymentDetails: 'payment_details',
      completedState: 'completed_state',
      completedAt: 'completed_at',
      awaitingArchive: 'awaiting_archive',
      sectionId: 'section_id',
    }
    const col = colMap[field] || field
    const { error } = await supabase
      .from('tasks')
      .upsert({
        id: taskId,
        user_id: _userId,
        [col]: value,
        updated_at: new Date().toISOString(),
      })
    if (error) console.error('[db] setTaskField error:', error)
  }
  // Always also update localStorage as fallback
  const all = lsGet('task_fields', {})
  all[taskId] = { ...(all[taskId] || {}), [field]: value }
  lsSet('task_fields', all)
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMISSION REQUESTS
// ═══════════════════════════════════════════════════════════════════════════

export async function getRequests() {
  if (useSupabase()) {
    const { data } = await supabase
      .from('commission_requests')
      .select('*')
      .eq('user_id', _userId)
      .order('created_at', { ascending: false })
    if (!data) return []
    // Convert snake_case to camelCase
    return data.map(r => ({
      id: r.id,
      createdAt: r.created_at,
      status: r.status,
      name: r.name,
      email: r.email,
      social: r.social,
      artworkType: r.artwork_type,
      description: r.description,
      usage: r.usage,
      styles: r.styles,
      formats: r.formats,
      size: r.size,
      deadline: r.deadline,
      budgetMin: r.budget_min,
      budgetMax: r.budget_max,
      notes: r.notes,
      refNotes: r.ref_notes,
      images: r.images,
      rejectReason: r.reject_reason,
      paymentDetails: r.payment_details,
      withPayment: r.with_payment,
    }))
  }
  return lsGet('commission_requests', [])
}

export async function saveRequest(request) {
  if (useSupabase()) {
    const { error } = await supabase
      .from('commission_requests')
      .upsert({
        id: request.id,
        user_id: _userId,
        status: request.status ?? 'pending',
        name: request.name,
        email: request.email,
        social: request.social ?? '',
        artwork_type: request.artworkType ?? '',
        description: request.description ?? '',
        usage: request.usage ?? '',
        styles: request.styles ?? [],
        formats: request.formats ?? [],
        size: request.size ?? '',
        deadline: request.deadline ?? '',
        budget_min: request.budgetMin ?? null,
        budget_max: request.budgetMax ?? null,
        notes: request.notes ?? '',
        ref_notes: request.refNotes ?? '',
        images: request.images ?? [],
        reject_reason: request.rejectReason ?? '',
        payment_details: request.paymentDetails ?? null,
        with_payment: request.withPayment ?? false,
      })
    if (error) console.error('[db] saveRequest error:', error)
  }
  // Sync to localStorage too
  const all = lsGet('commission_requests', [])
  const idx = all.findIndex(r => r.id === request.id)
  if (idx >= 0) all[idx] = request
  else all.unshift(request)
  lsSet('commission_requests', all)
}

// Public insert (no auth required — from client form)
export async function insertPublicRequest(request) {
  if (supabase) {
    // For public requests we need the studio owner's user_id
    // For now we use localStorage as the public form doesn't know the admin userId
    // TODO: add studio_slug lookup when multi-user is enabled
  }
  const all = lsGet('commission_requests', [])
  lsSet('commission_requests', [request, ...all])
}

// ═══════════════════════════════════════════════════════════════════════════
// PORTFOLIO
// ═══════════════════════════════════════════════════════════════════════════

// ── UUID generator (browser-compatible) ──────────────────────────────────
function genId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// TELEGRAM CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export async function getTelegramConfig() {
  if (useSupabase()) {
    const { data } = await supabase
      .from('profiles')
      .select('telegram_token, telegram_chat_id')
      .eq('id', _userId)
      .single()
    if (data?.telegram_token) {
      return { token: data.telegram_token, chatId: data.telegram_chat_id }
    }
  }
  // Fallback: localStorage (user-scoped key)
  const key = _userId ? `telegram_config_${_userId}` : 'telegram_config'
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}

export async function saveTelegramConfig(token, chatId) {
  if (useSupabase()) {
    await supabase.from('profiles').upsert({
      id: _userId,
      telegram_token: token || null,
      telegram_chat_id: chatId || null,
      updated_at: new Date().toISOString(),
    })
  }
  // Also keep in localStorage as cache
  const key = _userId ? `telegram_config_${_userId}` : 'telegram_config'
  localStorage.setItem(key, JSON.stringify({ token, chatId }))
}

// ═══════════════════════════════════════════════════════════════════════════
// GMAIL TOKENS
// ═══════════════════════════════════════════════════════════════════════════

export async function getGmailTokensDb() {
  if (useSupabase()) {
    const { data } = await supabase
      .from('profiles')
      .select('gmail_tokens')
      .eq('id', _userId)
      .single()
    if (data?.gmail_tokens) return data.gmail_tokens
  }
  try { return JSON.parse(localStorage.getItem('gmail_tokens') || 'null') } catch { return null }
}

export async function saveGmailTokensDb(tokens) {
  if (useSupabase()) {
    await supabase.from('profiles').upsert({
      id: _userId,
      gmail_tokens: tokens,
      updated_at: new Date().toISOString(),
    })
  }
  localStorage.setItem('gmail_tokens', JSON.stringify(tokens))
}

export async function clearGmailTokensDb() {
  if (useSupabase()) {
    await supabase.from('profiles').upsert({
      id: _userId,
      gmail_tokens: null,
      updated_at: new Date().toISOString(),
    })
  }
  localStorage.removeItem('gmail_tokens')
}

// ═══════════════════════════════════════════════════════════════════════════
// UI PREFERENCES (view mode, collapsed state, etc.)
// ═══════════════════════════════════════════════════════════════════════════

export async function getUiPrefs() {
  if (useSupabase()) {
    const { data } = await supabase
      .from('profiles')
      .select('ui_prefs')
      .eq('id', _userId)
      .single()
    if (data?.ui_prefs) return data.ui_prefs
  }
  return {}
}

let _uiPrefsSyncTimer = null
export function saveUiPref(key, value) {
  // Immediate localStorage write
  const uid = _userId || localStorage.getItem('_current_user_id') || 'default'
  localStorage.setItem(`${key}_${uid}`, String(value))
  // Debounced Supabase write
  if (_uiPrefsSyncTimer) clearTimeout(_uiPrefsSyncTimer)
  _uiPrefsSyncTimer = setTimeout(async () => {
    if (!useSupabase()) return
    try {
      const { data } = await supabase.from('profiles').select('ui_prefs').eq('id', _userId).single()
      const current = data?.ui_prefs ?? {}
      await supabase.from('profiles').upsert({
        id: _userId,
        ui_prefs: { ...current, [key]: value },
        updated_at: new Date().toISOString(),
      })
    } catch (e) { console.warn('[db] saveUiPref failed:', e?.message) }
  }, 500)
}

export async function savePortfolio(items) {
  if (useSupabase()) {
    // Delete all and re-insert (simple approach for small datasets)
    await supabase.from('portfolio_items').delete().eq('user_id', _userId)
    if (items.length > 0) {
      // Ensure every item has a valid string ID (not a float)
      const rows = items.map((item, i) => ({
        id: typeof item.id === 'string' ? item.id : genId(),
        user_id: _userId,
        url: item.url,
        title: item.title || '',
        description: item.description || '',
        tags: item.tags || [],
        storage_key: item.storageKey || null,
        backend: item.backend || 'base64',
        sort_order: i,
        created_at: item.createdAt || new Date().toISOString(),
      }))
      const { error } = await supabase.from('portfolio_items').insert(rows)
      if (error) console.error('[db] savePortfolio error:', error)
      else {
        // Update local items with the normalized string IDs
        const normalized = items.map((item, i) => ({
          ...item,
          id: rows[i].id,
        }))
        lsSet('portfolio_items', normalized)
        return
      }
    }
  }
  lsSet('portfolio_items', items)
}

export async function getPortfolio() {
  if (useSupabase()) {
    const { data } = await supabase
      .from('portfolio_items')
      .select('*')
      .eq('user_id', _userId)
      .order('sort_order', { ascending: true })
    if (data && data.length > 0) {
      return data.map(item => ({
        id: item.id,
        url: item.url,
        title: item.title || '',
        description: item.description || '',
        tags: item.tags || [],
        storageKey: item.storage_key || null,
        backend: item.backend || 'base64',
        createdAt: item.created_at || new Date().toISOString(),
      }))
    }
    return []
  }
  return lsGet('portfolio_items', [])
}

// ═══════════════════════════════════════════════════════════════════════════
// STUDIO GUIDE
// ═══════════════════════════════════════════════════════════════════════════

export async function getGuide() {
  if (useSupabase()) {
    const { data } = await supabase
      .from('studio_guide')
      .select('blocks')
      .eq('user_id', _userId)
      .single()
    return data?.blocks ?? null
  }
  const saved = localStorage.getItem('studio_guide')
  return saved ? JSON.parse(saved) : null
}

export async function saveGuide(blocks) {
  if (useSupabase()) {
    const { error } = await supabase
      .from('studio_guide')
      .upsert({ user_id: _userId, blocks, updated_at: new Date().toISOString() })
    if (error) console.error('[db] saveGuide error:', error)
  }
  lsSet('studio_guide', blocks)
}

// ═══════════════════════════════════════════════════════════════════════════
// KANBAN CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export async function getKanbanConfig() {
  if (useSupabase()) {
    const { data } = await supabase
      .from('kanban_config')
      .select('*')
      .eq('user_id', _userId)
      .single()
    if (data) return {
      customSections: data.custom_sections ?? [],
      orderOverrides: data.order_overrides ?? {},
      colorOverrides: data.color_overrides ?? {},
      labelOverrides: data.label_overrides ?? {},
    }
  }
  return {
    customSections: lsGet('kanban_custom_sections', []),
    orderOverrides: lsGet('kanban_order', {}),
    colorOverrides: lsGet('kanban_colors', {}),
    labelOverrides: lsGet('kanban_labels', {}),
  }
}

export async function saveKanbanConfig(config) {
  if (useSupabase()) {
    const { error } = await supabase
      .from('kanban_config')
      .upsert({
        user_id: _userId,
        custom_sections: config.customSections ?? [],
        order_overrides: config.orderOverrides ?? {},
        color_overrides: config.colorOverrides ?? {},
        label_overrides: config.labelOverrides ?? {},
        updated_at: new Date().toISOString(),
      })
    if (error) console.error('[db] saveKanbanConfig error:', error)
  }
  if (config.customSections !== undefined) lsSet('kanban_custom_sections', config.customSections)
  if (config.orderOverrides !== undefined) lsSet('kanban_order', config.orderOverrides)
  if (config.colorOverrides !== undefined) lsSet('kanban_colors', config.colorOverrides)
  if (config.labelOverrides !== undefined) lsSet('kanban_labels', config.labelOverrides)
}
