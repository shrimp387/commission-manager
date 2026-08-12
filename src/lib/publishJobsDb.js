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
    task_id:     job.taskId     ?? null,
    task_name:   job.taskName   ?? null,
    image_url:   job.imageUrl,
    platforms:   job.platforms  ?? [],
    title:       job.title,
    description: job.description ?? null,
    tags:        job.tags        ?? [],
    rating:      job.rating      ?? 'safe',
    // status defaults to 'pending' via DB DEFAULT — no need to send it
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
  if (!supabase) throw new Error('Supabase no disponible')
  if (!userId)   throw new Error('Usuario no autenticado')

  const { data, error } = await supabase
    .from('publish_jobs')
    .insert(mapToRow(jobData, userId))
    .select()
    .single()

  if (error) {
    // RLS violation — user_id mismatch or missing auth
    if (error.code === '42501' || error.message?.includes('row-level security')) {
      throw new Error('No autorizado para crear jobs de publicación')
    }
    throw new Error(error.message ?? 'Error al crear el job de publicación')
  }

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
