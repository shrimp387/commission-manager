/**
 * e621.js — Cliente para publicar en e621.net
 *
 * Las peticiones van a través del Cloudflare Worker (R2 proxy) para evitar
 * bloqueos CORS del navegador. Las credenciales se envían en headers HTTP
 * y nunca se almacenan en el Worker.
 *
 * API de e621: https://e621.net/help/api
 * Rating: s = safe, q = questionable, e = explicit
 */
import { getConfig } from '../../store/appConfig.js'
import { supabase } from '../supabase.js'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

/**
 * Obtiene los headers de autenticación para el Worker.
 * Incluye el JWT de Supabase (para que el Worker valide que eres tú)
 * y las credenciales de e621 en headers separados.
 */
async function buildHeaders(e621User, e621Key) {
  const headers = {
    'X-Platform-User': e621User,
    'X-Platform-Key': e621Key,
  }

  // Añadir JWT de Supabase para autenticación con el Worker
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession()
      if (data?.session?.access_token) {
        headers['Authorization'] = `Bearer ${data.session.access_token}`
      }
    } catch {}
  }

  return headers
}

/**
 * Verifica que las credenciales de e621 son válidas.
 * @param {string} username — nombre de usuario de e621
 * @param {string} apiKey   — API key generada en e621
 * @returns {Promise<{ ok: boolean, username?: string, level?: string, error?: string }>}
 */
export async function testE621Credentials(username, apiKey) {
  if (!WORKER_URL) throw new Error('Worker URL no configurada (VITE_R2_WORKER_URL)')
  const headers = await buildHeaders(username, apiKey)
  const res = await fetch(`${WORKER_URL}/proxy/e621/test`, { headers })
  if (!res.ok) throw new Error(`Worker error: ${res.status}`)
  return res.json()
}

/**
 * Publica una obra en e621.
 *
 * @param {object} params
 * @param {Blob}     params.file        — archivo de imagen
 * @param {string}   params.fileName    — nombre del archivo (ej: 'artwork.png')
 * @param {string[]} params.tags        — array de tags normalizados
 * @param {string}   params.rating      — 's' | 'q' | 'e'  (safe/questionable/explicit)
 * @param {string}   params.description — descripción del post (opcional)
 * @param {string[]} params.sources     — URLs de origen (opcional, recomendado)
 * @returns {Promise<{ ok: boolean, postId?: number, url?: string, error?: string }>}
 */
export async function publishToE621({ file, fileName, tags, rating = 's', description = '', sources = [] }) {
  if (!WORKER_URL) throw new Error('Worker URL no configurada (VITE_R2_WORKER_URL)')

  const cfg = getConfig()
  const username = cfg.e621Username
  const apiKey   = cfg.e621ApiKey

  if (!username || !apiKey) {
    throw new Error('Configura tu usuario y API Key de e621 en Conexiones.')
  }

  if (!tags || tags.length === 0) {
    throw new Error('e621 requiere al menos un tag para publicar.')
  }

  const headers = await buildHeaders(username, apiKey)

  const form = new FormData()
  form.append('file', file, fileName)
  form.append('tags', tags.join(' '))         // e621 usa tags separados por espacio
  form.append('rating', rating)
  if (description) form.append('description', description)
  if (sources.length > 0) form.append('sources', sources.join('\n'))

  const res = await fetch(`${WORKER_URL}/proxy/e621/post`, {
    method: 'POST',
    headers,   // sin Content-Type — FormData lo pone con el boundary correcto
    body: form,
  })

  if (!res.ok) throw new Error(`Worker error: ${res.status}`)
  return res.json()
}
