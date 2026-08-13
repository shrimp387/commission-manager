/**
 * publishJobsDb.js — Capa de datos para la tabla `publish_jobs`.
 *
 * Permite a la app web insertar y consultar trabajos de publicación
 * que la companion app Electron procesa de forma asíncrona.
 *
 * Sigue el mismo patrón que publicationsDb.js — importa el cliente
 * Supabase existente sin crear una nueva instancia.
 *
 * Schema PublishJob (camelCase en app, snake_case en DB):
 *   id            — UUID (generado por Supabase)
 *   userId        — ID del artista autenticado
 *   taskId        — ID de la tarea de comisión de origen
 *   taskName      — nombre de la comisión
 *   imageUrl      — URL pública en Cloudflare R2
 *   platforms     — array de plataformas: ['e621','inkbunny','discord',...]
 *   title         — título de la publicación
 *   description   — descripción opcional
 *   tags          — array de tags normalizados
 *   rating        — 'safe' | 'questionable' | 'explicit'
 *   status        — 'pending' | 'running' | 'completed' | 'partial' | 'error'
 *   startedAt     — ISO-8601 | null
 *   completedAt   — ISO-8601 | null
 *   results       — [{ platform, ok, url }] | null
 *   errors        — [{ platform, error }] | null
 *   createdAt     — ISO-8601
 */
import { supabase } from './supabase.js'
import { getCurrentUserId } from './db.js'

// ── Mapping helpers ───────────────────────────────────────────────────────────

/**
 * Converts a camelCase job object to the snake_case row expected by Supabase.
 * @param {object} job
 * @param {string} userId
 */
function mapToRow(job, userId) {
  return {
    user_id:     userId,
    task_id:     job.taskId     ?? null,   // stored as TEXT, not UUID constraint
    task_name:   job.taskName   ?? null,
    image_url:   job.imageUrl,
    platforms:   job.platforms  ?? [],
    title:       job.title,
    description: job.description ?? null,
    tags:        job.tags        ?? [],
    rating:      job.rating      ?? 'safe',
  }
}

/**
 * Converts a Supabase snake_case row to a camelCase PublishJob object.
 * @param {object} row
 * @returns {object}
 */
function mapFromRow(row) {
  return {
    id:          row.id,
    userId:      row.user_id,
    taskId:      row.task_id      ?? null,
    taskName:    row.task_name    ?? null,
    imageUrl:    row.image_url,
    platforms:   row.platforms    ?? [],
    title:       row.title,
    description: row.description  ?? null,
    tags:        row.tags         ?? [],
    rating:      row.rating       ?? 'safe',
    status:      row.status,
    startedAt:   row.started_at   ?? null,
    completedAt: row.completed_at ?? null,
    results:     row.results      ?? null,
    errors:      row.errors       ?? null,
    createdAt:   row.created_at,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Inserts a new publish job into Supabase.
 * The job will be picked up by the companion app on its next polling cycle.
 *
 * @param {object} jobData — { taskId, taskName, imageUrl, platforms, title, description, tags, rating }
 * @returns {Promise<object>} — the inserted PublishJob record (camelCase)
 * @throws {'No autorizado para crear jobs de publicación'} — on RLS violation
 * @throws {string} — Supabase error message for other failures
 */
export async function insertPublishJob(jobData) {
  const userId = getCurrentUserId()
  console.log('[publishJobsDb] 📝 insertPublishJob called:', {
    userId,
    platforms: jobData.platforms,
    title: jobData.title,
    imageUrl: jobData.imageUrl?.substring(0, 50) + '...',
  })
  
  if (!supabase) {
    console.error('[publishJobsDb] ❌ Supabase no disponible')
    throw new Error('Supabase no disponible')
  }
  if (!userId) {
    console.error('[publishJobsDb] ❌ Usuario no autenticado')
    throw new Error('Usuario no autenticado')
  }

  const row = mapToRow(jobData, userId)
  console.log('[publishJobsDb] 📤 Insertando en Supabase:', {
    table: 'publish_jobs',
    user_id: row.user_id,
    platforms: row.platforms,
    status: 'pending (default)',
  })

  const { data, error } = await supabase
    .from('publish_jobs')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error('[publishJobsDb] ❌ Error de Supabase:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    })
    // RLS violation — user_id mismatch or missing auth
    if (error.code === '42501' || error.message?.includes('row-level security')) {
      throw new Error('No autorizado para crear jobs de publicación')
    }
    throw new Error(error.message ?? 'Error al crear el job de publicación')
  }

  console.log('[publishJobsDb] ✅ Job insertado exitosamente:', {
    id: data.id,
    status: data.status,
    created_at: data.created_at,
  })

  return mapFromRow(data)
}

/**
 * Loads all publish jobs for a given user, newest first.
 *
 * @param {string} [userId] — defaults to getCurrentUserId()
 * @returns {Promise<object[]>} — array of PublishJob records (camelCase), empty if none
 */
export async function getPublishJobs(userId) {
  const uid = userId ?? getCurrentUserId()
  if (!supabase || !uid) return []

  const { data, error } = await supabase
    .from('publish_jobs')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('[publishJobsDb] getPublishJobs error:', error.message)
    return []
  }

  return (data ?? []).map(mapFromRow)
}
