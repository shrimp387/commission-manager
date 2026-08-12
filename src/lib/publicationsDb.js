/**
 * publicationsDb.js — Capa de datos para Publication_Records.
 *
 * Persiste en Supabase (tabla publications) con fallback a localStorage.
 * Sigue el mismo patrón que src/store/archiveDb.js.
 *
 * Schema Publication_Record:
 *   id                   — UUID v4
 *   taskId               — ID de la tarea de comisión de origen
 *   taskName             — nombre de la comisión
 *   imageUrl             — URL pública en Cloudflare R2
 *   platforms            — array de nombres de plataformas destino
 *   status               — 'queued' | 'published' | 'error'
 *   errorMessage         — string | null
 *   postybirbSubmissionId — ID de la submission en PostyBirb
 *   sentAt               — ISO-8601 UTC
 *   userId               — ID del artista autenticado
 */
import { supabase } from './supabase.js'
import { getCurrentUserId } from './db.js'

// ── localStorage helpers ───────────────────────────────────────────────────────

function getLsKey() {
  const uid = getCurrentUserId()
  return uid ? `publication_records_${uid}` : 'publication_records'
}

function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(getLsKey()) || '[]')
  } catch {
    return []
  }
}

function saveLocal(records) {
  try {
    localStorage.setItem(getLsKey(), JSON.stringify(records))
  } catch (e) {
    console.warn('[publicationsDb] localStorage full:', e?.message)
  }
}

// ── Retry queue for failed Supabase writes ────────────────────────────────────

/** Map of recordId → intervalId for pending Supabase retries */
const _retryIntervals = new Map()

function scheduleRetry(record) {
  if (_retryIntervals.has(record.id)) return // already scheduled
  const intervalId = setInterval(async () => {
    try {
      await upsertToSupabase(record)
      // Success — cancel the retry interval
      clearInterval(intervalId)
      _retryIntervals.delete(record.id)
      console.debug(`[publicationsDb] Retry succeeded for record ${record.id}`)
    } catch {
      // Still failing — keep retrying
    }
  }, 60_000) // retry every 60 seconds
  _retryIntervals.set(record.id, intervalId)
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

function mapToRow(record, userId) {
  return {
    id: record.id,
    user_id: userId,
    task_id: record.taskId,
    task_name: record.taskName,
    image_url: record.imageUrl ?? null,
    platforms: record.platforms ?? [],
    status: record.status,
    error_message: record.errorMessage ?? null,
    postybirb_submission_id: record.postybirbSubmissionId ?? null,
    sent_at: record.sentAt,
  }
}

function mapFromRow(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    taskName: row.task_name,
    imageUrl: row.image_url ?? null,
    platforms: row.platforms ?? [],
    status: row.status,
    errorMessage: row.error_message ?? null,
    postybirbSubmissionId: row.postybirb_submission_id ?? null,
    sentAt: row.sent_at,
    userId: row.user_id,
  }
}

async function upsertToSupabase(record) {
  const userId = getCurrentUserId()
  if (!supabase || !userId) throw new Error('Supabase not available')
  const { error } = await supabase
    .from('publications')
    .upsert(mapToRow(record, userId), { onConflict: 'id' })
  if (error) throw error
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Guarda un Publication_Record.
 * 1. Guarda síncronamente en localStorage (fallback inmediato).
 * 2. Intenta upsert en Supabase.
 * 3. Si Supabase falla, programa reintentos cada 60s hasta que tenga éxito.
 *
 * @param {object} record — Publication_Record a guardar
 */
export async function savePublication(record) {
  // 1. localStorage inmediato
  const existing = loadLocal()
  const idx = existing.findIndex(r => r.id === record.id)
  if (idx >= 0) {
    existing[idx] = record
  } else {
    existing.unshift(record)
  }
  saveLocal(existing)

  // 2. Supabase
  try {
    await upsertToSupabase(record)
  } catch (e) {
    console.warn(`[publicationsDb] Supabase save failed (will retry): ${e?.message}`)
    scheduleRetry(record)
  }
}

/**
 * Carga todos los Publication_Records del usuario actual.
 * Intenta Supabase primero; en caso de fallo usa localStorage.
 *
 * @returns {Promise<{ records: object[], fromLocalStorage: boolean }>}
 */
export async function loadPublications() {
  const userId = getCurrentUserId()
  if (supabase && userId) {
    try {
      const { data, error } = await supabase
        .from('publications')
        .select('*')
        .eq('user_id', userId)
        .order('sent_at', { ascending: false })
      if (error) throw error
      if (data) {
        return { records: data.map(mapFromRow), fromLocalStorage: false }
      }
    } catch (e) {
      console.warn('[publicationsDb] Supabase load failed, using localStorage:', e?.message)
    }
  }
  return { records: loadLocal(), fromLocalStorage: true }
}

/**
 * Actualiza SOLO el campo `status` (y opcionalmente `errorMessage`) de un registro.
 * No reemplaza el registro completo — cumple inmutabilidad del resto de campos.
 *
 * @param {string} id           — ID del Publication_Record
 * @param {string} status       — nuevo estado: 'queued' | 'published' | 'error'
 * @param {string|null} errorMessage — mensaje de error (solo para status 'error')
 */
export async function patchPublicationStatus(id, status, errorMessage = null) {
  // Actualizar en localStorage
  const records = loadLocal()
  const updated = records.map(r =>
    r.id === id ? { ...r, status, errorMessage: errorMessage ?? r.errorMessage } : r
  )
  saveLocal(updated)

  // Actualizar en Supabase
  const userId = getCurrentUserId()
  if (!supabase || !userId) return
  try {
    const patch = { status }
    if (errorMessage !== null) patch.error_message = errorMessage
    const { error } = await supabase
      .from('publications')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
    if (error) throw error
  } catch (e) {
    console.warn('[publicationsDb] Supabase patch failed:', e?.message)
  }
}

/**
 * Limpia el caché en memoria (no borra localStorage ni Supabase).
 * Llamar desde AuthContext en el flujo de logout.
 */
export function clearPublicationsCache() {
  // Cancelar todos los reintentos pendientes
  _retryIntervals.forEach(intervalId => clearInterval(intervalId))
  _retryIntervals.clear()
  // No borramos localStorage — los datos deben sobrevivir al logout
}
