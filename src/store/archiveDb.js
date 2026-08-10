/**
 * Base de datos de comisiones archivadas.
 * Persiste en Supabase (tabla archived_commissions) con fallback a localStorage.
 * Las claves de localStorage se prefijan con user_id para evitar mezclas.
 */
import { supabase } from '../lib/supabase.js'
import { getCurrentUserId } from '../lib/db.js'

function getLsKey() {
  const uid = getCurrentUserId()
  return uid ? `archived_commissions_${uid}` : 'archived_commissions'
}

function load() {
  try { return JSON.parse(localStorage.getItem(getLsKey()) || '[]') }
  catch { return [] }
}

function saveLocal(data) {
  try { localStorage.setItem(getLsKey(), JSON.stringify(data)) }
  catch (e) { console.warn('archiveDb: localStorage full', e) }
}

async function saveToSupabase(record) {
  const userId = getCurrentUserId()
  if (!supabase || !userId) return
  try {
    await supabase.from('archived_commissions').upsert({
      id: record.id,
      user_id: userId,
      text: record.text,
      client: record.client,
      stage: record.stage,
      priority: record.priority,
      deadline: record.deadline,
      assignee: record.assignee,
      notes: record.notes,
      tags: record.tags,
      thumbnail_url: record.thumbnailUrl,
      timer: record.timer,
      archived_at: new Date(record.archivedAt).toISOString(),
      completed_at: new Date(record.completedAt).toISOString(),
      checklist: record.checklist,
      comments: record.comments,
    })
  } catch (e) { console.warn('[archiveDb] Supabase save failed:', e?.message) }
}

async function deleteFromSupabase(id) {
  const userId = getCurrentUserId()
  if (!supabase || !userId) return
  try {
    await supabase.from('archived_commissions').delete().eq('id', id).eq('user_id', userId)
  } catch (e) { console.warn('[archiveDb] Supabase delete failed:', e?.message) }
}

export async function loadArchivedFromSupabase() {
  const userId = getCurrentUserId()
  if (!supabase || !userId) return null
  try {
    const { data } = await supabase
      .from('archived_commissions')
      .select('*')
      .eq('user_id', userId)
      .order('archived_at', { ascending: false })
    if (!data) return null
    return data.map(r => ({
      id: r.id,
      text: r.text,
      client: r.client || '',
      stage: r.stage || 'delivered',
      priority: r.priority || 'ok',
      deadline: r.deadline || '',
      assignee: r.assignee || '',
      notes: r.notes || '',
      tags: r.tags || [],
      thumbnailUrl: r.thumbnail_url || null,
      timer: r.timer || 0,
      archivedAt: new Date(r.archived_at).getTime(),
      completedAt: new Date(r.completed_at).getTime(),
      checklist: r.checklist || [],
      comments: r.comments || 0,
    }))
  } catch (e) {
    console.warn('[archiveDb] Supabase load failed:', e?.message)
    return null
  }
}

export function getArchived() {
  return load()
}

export function archiveTask(task, fields = {}) {
  const existing = load()
  if (existing.some(a => a.id === task.id)) return

  const attachments = fields.attachments || []
  const thumbnailUrl = attachments.find(a => a.type?.startsWith('image/'))?.url || null

  const record = {
    id: task.id,
    text: task.text,
    client: fields.client || '',
    stage: fields.stage || 'delivered',
    priority: fields.priority || 'ok',
    deadline: fields.deadline || '',
    assignee: fields.assignee || '',
    notes: fields.note || '',
    tags: fields.tags || [],
    thumbnailUrl,
    timer: fields.timer || 0,
    archivedAt: Date.now(),
    completedAt: fields.completedAt || Date.now(),
    checklist: fields.checklist || [],
    comments: (fields.comments || []).length,
  }

  saveLocal([record, ...existing])
  saveToSupabase(record)
  return record
}

export function removeArchived(id) {
  saveLocal(load().filter(a => a.id !== id))
  deleteFromSupabase(id)
}

export function updateArchivedTags(id, tags) {
  const updated = load().map(a => a.id === id ? { ...a, tags } : a)
  saveLocal(updated)
  const record = updated.find(a => a.id === id)
  if (record) saveToSupabase(record)
}

export function clearArchived() {
  saveLocal([])
}
