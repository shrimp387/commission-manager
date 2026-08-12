/**
 * weasyl.js — Publisher module for Weasyl
 *
 * Uses Node.js built-in fetch (Node 18+) — no node-fetch dependency needed.
 */

'use strict'

const FormData = require('form-data')

const WEASYL_BASE = 'https://www.weasyl.com/api'
const DOWNLOAD_TIMEOUT_MS = 30_000

// Weasyl rating mapping
const RATING_MAP = {
  safe:         10,
  questionable: 30,
  explicit:     40,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function downloadImage(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)

  let res
  try {
    res = await fetch(url, { signal: controller.signal })
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error('Timeout al descargar la imagen para Weasyl')
    throw err
  }
  clearTimeout(timer)

  if (!res.ok) throw new Error(`Error al descargar imagen: HTTP ${res.status}`)

  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || 'image/png'
  return { buffer, contentType }
}

async function extractError(res) {
  try {
    const json = await res.json()
    return json?.error?.message || json?.error || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Publishes an artwork job to Weasyl.
 *
 * @param {object} job         — publish job from Supabase
 * @param {object} credentials — { apiKey, enabled }
 * @returns {Promise<{ ok: true, url: string }>}
 */
async function publishWeasyl(job, credentials) {
  const { apiKey } = credentials ?? {}

  if (!apiKey) {
    throw new Error('API Key de Weasyl requerida')
  }

  const headers = { 'X-Weasyl-API-Key': apiKey }

  // Fetch the user's login name for building the URL later
  const whoamiRes = await fetch(`${WEASYL_BASE}/whoami`, { headers })
  if (!whoamiRes.ok) {
    const errMsg = await extractError(whoamiRes)
    throw new Error(`Weasyl whoami: ${errMsg}`)
  }
  const whoamiData = await whoamiRes.json()
  const login = whoamiData?.login

  // Download image
  const filename = job.image_url?.split('/').pop() || 'artwork.png'
  const { buffer, contentType } = await downloadImage(job.image_url)

  // Build multipart form
  const form = new FormData()
  form.append('submitfile', buffer, { filename, contentType })
  form.append('title', job.title ?? '')
  form.append('content', job.description ?? '')
  form.append('rating', String(RATING_MAP[job.rating] ?? 10))

  // Weasyl accepts tags as a comma-separated string in the 'tags' field
  form.append('tags', (job.tags ?? []).join(' '))

  const submitRes = await fetch(`${WEASYL_BASE}/submissions/submit/visual`, {
    method: 'POST',
    headers: {
      ...headers,
      ...form.getHeaders(),
    },
    body: form,
  })

  if (submitRes.ok) {
    const data = await submitRes.json().catch(() => ({}))
    const submitid = data?.submitid
    const url = login && submitid
      ? `https://www.weasyl.com/~${login}/submissions/${submitid}`
      : null
    return { ok: true, url }
  }

  const errMsg = await extractError(submitRes)
  throw new Error(`Weasyl: ${errMsg}`)
}

/**
 * Tests Weasyl credentials using the /whoami endpoint.
 *
 * @param {object} credentials — { apiKey }
 * @returns {Promise<{ ok: boolean, username?: string, error?: string }>}
 */
async function testWeasyl(credentials) {
  const { apiKey } = credentials ?? {}

  if (!apiKey) {
    return { ok: false, error: 'API Key de Weasyl requerida' }
  }

  try {
    const res = await fetch(`${WEASYL_BASE}/whoami`, {
      headers: { 'X-Weasyl-API-Key': apiKey },
    })

    if (res.ok) {
      const data = await res.json()
      return { ok: true, username: data?.login }
    }

    const errMsg = await extractError(res)
    return { ok: false, error: errMsg }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

module.exports = { publishWeasyl, testWeasyl }
