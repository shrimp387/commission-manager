/**
 * postybirb.js — Cliente HTTP para PostyBirb v4 (NestJS, API REST).
 *
 * PostyBirb corre en la PC del artista vía Docker + Cloudflare Tunnel.
 * La URL pública se configura en ConnectionsPage y se guarda en appConfig.
 *
 * Endpoints usados:
 *   GET  {url}/api/account               — lista Platform_Accounts conectadas
 *   POST {url}/submissions               — crea submission (multipart/form-data)
 *   PATCH {url}/submissions/:id          — actualiza tags y plataformas
 *   POST {url}/post/create-post          — encola para publicación
 */
import { getConfig } from '../store/appConfig.js'

const TIMEOUT_MS = 30_000

/**
 * Construye los headers base para todas las peticiones a PostyBirb.
 * Incluye X-API-Key solo si está configurada.
 */
function buildHeaders(extra = {}) {
  const { postybirbApiKey } = getConfig()
  const headers = { ...extra }
  if (postybirbApiKey) {
    headers['X-API-Key'] = postybirbApiKey
  }
  return headers
}

/**
 * Obtiene la URL base de PostyBirb desde la configuración.
 * Lanza un error descriptivo si no está configurada.
 */
function getBaseUrl() {
  const { postybirbUrl } = getConfig()
  if (!postybirbUrl) {
    throw new Error(
      'PostyBirb URL no configurada. Ve a Conexiones y agrega la URL del Cloudflare Tunnel.'
    )
  }
  return postybirbUrl.replace(/\/$/, '')
}

/**
 * Ejecuta un fetch con timeout mediante AbortController.
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timerId = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    return res
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        `Timeout: PostyBirb no respondió en ${TIMEOUT_MS / 1000}s. Verifica que el Cloudflare Tunnel esté activo.`
      )
    }
    throw err
  } finally {
    clearTimeout(timerId)
  }
}

/**
 * Extrae el mensaje de error de una respuesta no-2xx.
 */
async function extractErrorMessage(res) {
  try {
    const body = await res.json()
    return body.message || body.error || JSON.stringify(body)
  } catch {
    return `Error HTTP ${res.status}: ${res.statusText}`
  }
}

/**
 * @typedef {Object} PlatformAccount
 * @property {string} id       — ID interno de PostyBirb
 * @property {string} website  — nombre de la plataforma (e.g. "FurAffinity")
 * @property {string} name     — nombre de usuario en la plataforma
 */

/**
 * Obtiene la lista de Platform_Accounts conectadas en PostyBirb.
 * @returns {Promise<PlatformAccount[]>}
 */
export async function getPostyBirbAccounts() {
  const base = getBaseUrl()
  const res = await fetchWithTimeout(`${base}/api/account`, {
    method: 'GET',
    headers: buildHeaders({ Accept: 'application/json' }),
  })
  if (!res.ok) {
    const msg = await extractErrorMessage(res)
    throw new Error(msg)
  }
  const data = await res.json()
  return Array.isArray(data) ? data : (data.accounts ?? data.data ?? [])
}

/**
 * Crea una nueva submission en PostyBirb con el archivo adjunto.
 * @param {Blob}   file        — archivo de imagen (blob descargado de R2)
 * @param {string} fileName    — nombre del archivo (e.g. "artwork.png")
 * @param {string} title       — título de la publicación
 * @param {string} description — descripción (puede estar vacía)
 * @returns {Promise<string>}  — ID de la submission creada
 */
export async function createSubmission(file, fileName, title, description) {
  const base = getBaseUrl()
  const form = new FormData()
  form.append('files', file, fileName)
  form.append('name', title)
  if (description) form.append('description', description)
  form.append('type', 'FILE')

  const res = await fetchWithTimeout(`${base}/submissions`, {
    method: 'POST',
    // Sin Content-Type — el browser lo añade con el boundary correcto
    headers: buildHeaders(),
    body: form,
  })
  if (!res.ok) {
    const msg = await extractErrorMessage(res)
    throw new Error(msg)
  }
  const data = await res.json()
  const submission = Array.isArray(data) ? data[0] : data
  if (!submission?.id) {
    throw new Error('PostyBirb no devolvió un ID de submission válido.')
  }
  return submission.id
}

/**
 * Actualiza los tags y las cuentas destino de una submission existente.
 * @param {string}   id         — ID de la submission
 * @param {string[]} tags       — array de tags normalizados
 * @param {string[]} accountIds — IDs de Platform_Accounts seleccionadas
 */
export async function updateSubmission(id, { tags = [], accountIds = [] }) {
  const base = getBaseUrl()
  const body = {
    options: accountIds.map(accountId => ({
      accountId,
      data: {
        tags: { value: tags, overrideDefault: true },
      },
    })),
  }

  const res = await fetchWithTimeout(`${base}/submissions/${id}`, {
    method: 'PATCH',
    headers: buildHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const msg = await extractErrorMessage(res)
    throw new Error(msg)
  }
}

/**
 * Encola una submission para publicación inmediata en PostyBirb.
 * @param {string} id — ID de la submission a encolar
 */
export async function queueSubmission(id) {
  const base = getBaseUrl()
  const res = await fetchWithTimeout(`${base}/post/create-post`, {
    method: 'POST',
    headers: buildHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify({ submissionIds: [id] }),
  })
  if (!res.ok) {
    const msg = await extractErrorMessage(res)
    throw new Error(msg)
  }
}
